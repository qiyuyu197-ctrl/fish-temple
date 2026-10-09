# tools/album-pull.ps1 — 从 iPhone「相机胶卷」随机抽取照片到本地 staging 目录
# ---------------------------------------------------------------------------
# 背景：项目的插画素材需要本地图片，但手机相册不在电脑上。iPhone 用数据线连上后
#      会作为「便携设备（MTP）」出现，PowerShell 的普通文件 API 读不到，只能用
#      Shell.Application 这个 COM 接口逐个枚举 / 拷贝。
#
# 用法（手机需连线、已信任本机、并且全程保持解锁）：
#   powershell -ExecutionPolicy Bypass -File tools\album-pull.ps1 -Count 180
#   powershell -ExecutionPolicy Bypass -File tools\album-pull.ps1 -Inventory     # 只建清单
#   powershell -ExecutionPolicy Bypass -File tools\album-pull.ps1 -Count 60 -Fresh
#
# 产物（默认 staging = D:\ft-album-staging；老位置 %USERPROFILE%\Downloads\ft-album-staging 仍兼容）：
#   candidates.json     全部候选照片清单（枚举一次后缓存，重跑直接复用）
#   <相册分组>\<文件名>  抽到的原图
#   pull-manifest.json  本次抽取的记录
#   pull.log            运行日志
#
# 实测要点：
#   · MTP 枚举很慢（每个相册一次 COM 往返，iOS 端还要按需索引），所以清单会缓存；
#     进度按相册逐个打印，卡住时能看出卡在哪一个。
#   · MTP 给的文件名经常没有扩展名，或者扩展名与实际内容不符（实测遇到过内容是
#     JPEG 却叫 .PNG）。真正的格式判断交给 tools/album-build.py 读文件头来做。
#   · CopyHere 是异步的、没有完成回调，只能轮询目标目录的文件数。
#
# 注意：本文件必须保存为「UTF-8 with BOM」。Windows PowerShell 5.1 不会把无 BOM 的
#      UTF-8 当 UTF-8 读，中文注释会乱码并导致语法错误。

param(
  [int]$Count = 180,
  # 原图暂存区：留空则自动解析（优先 D:\ft-album-staging，其次老位置 Downloads）
  [string]$Stage = '',
  [string]$DeviceName = '*iPhone*',
  [switch]$Inventory,          # 只枚举清单，不拷贝
  [switch]$Fresh,              # 忽略 candidates.json 重新枚举
  [switch]$IncludeExisting     # 连 staging 里已经拷过的也一起重新抽（默认跳过）
)

$ErrorActionPreference = 'Stop'

# 默认 staging：站点与暂存区都已搬到 D 盘；老位置仍在的话也兼容
if ([string]::IsNullOrWhiteSpace($Stage)) {
  $Stage = if (Test-Path 'D:\ft-album-staging') { 'D:\ft-album-staging' }
           else { Join-Path $env:USERPROFILE 'Downloads\ft-album-staging' }
}
New-Item -ItemType Directory -Force -Path $Stage | Out-Null
$log = Join-Path $Stage 'pull.log'
$cachePath = Join-Path $Stage 'candidates.json'
$manifestPath = Join-Path $Stage 'pull-manifest.json'

function Log($msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $msg
  Write-Output $line
  Add-Content -Path $log -Value $line -Encoding UTF8
}

Log "staging = $Stage"

$shell = New-Object -ComObject Shell.Application
$pc = $shell.NameSpace(17)                      # 17 = ssfDRIVES（「此电脑」）
$phone = @($pc.Items() | Where-Object { $_.Name -like $DeviceName })[0]
if (-not $phone) { throw "没找到便携设备（$DeviceName）。请确认手机已连接、已信任本机、并已解锁。" }
Log "device = $($phone.Name)"

$storage = @($phone.GetFolder.Items() | Where-Object { $_.IsFolder })[0]
if (-not $storage) { throw "设备里没有可访问的存储区（手机可能锁屏了，解锁后重试）。" }
Log "storage = $($storage.Name)"

$albums = @($storage.GetFolder.Items() | Where-Object { $_.IsFolder })

# ---- 1) 清单：有缓存就复用，避免重复的慢枚举 ----
# ⚠️ Windows PowerShell 5.1 的 ConvertFrom-Json 会把 JSON 数组当作「一个对象」返回，
#    直接 @() 包起来会变成「数组套数组」（Count 显示 1，元素其实是整份清单），
#    所以这里用 ForEach-Object 显式展开一层。
$candidates = @()
if (-not $Fresh -and (Test-Path $cachePath)) {
  try {
    $parsed = Get-Content -Raw -Encoding UTF8 $cachePath | ConvertFrom-Json
    $candidates = @($parsed | ForEach-Object { $_ })
  } catch { $candidates = @() }
}
if ($candidates.Count -gt 0) {
  Log "inventory = cached ($($candidates.Count) items)   <- 想重新枚举请加 -Fresh"
} else {
  Log "albums = $($albums.Count)  —— 逐个枚举中（这一步最慢，请保持手机解锁）"
  $found = New-Object System.Collections.ArrayList
  $i = 0
  foreach ($album in $albums) {
    $i++
    $swA = [System.Diagnostics.Stopwatch]::StartNew()
    $items = @($album.GetFolder.Items())
    $kept = 0
    foreach ($it in $items) {
      if ($it.IsFolder) { continue }
      # 明显的视频/动图先排除（扩展名不可靠，能排就排）
      if ($it.Name -match '\.(mov|mp4|m4v|avi|gif)$') { continue }
      [void]$found.Add([pscustomobject]@{ album = $album.Name; name = $it.Name })
      $kept++
    }
    Log ("  [{0,2}/{1}] {2,-12} items={3,3} kept={4,3} {5,5:n1}s total={6}" -f `
         $i, $albums.Count, $album.Name, $items.Count, $kept, $swA.Elapsed.TotalSeconds, $found.Count)
    # 每枚举完一个相册就落盘：中途断开也不用从头再来
    $found | ConvertTo-Json -Depth 3 | Set-Content -Path $cachePath -Encoding UTF8
  }
  $candidates = @($found)
  Log "inventory = $($candidates.Count) candidates -> $cachePath"
}

if ($Inventory) { Log 'inventory only (-Inventory)，结束'; return }
if ($candidates.Count -eq 0) { throw "清单为空（手机可能锁屏了）。" }

# ---- 1.5) 已经在 staging 里的跳过：分多次补量时不重复传输（-IncludeExisting 可关闭） ----
if (-not $IncludeExisting) {
  $beforeSkip = $candidates.Count
  $candidates = @($candidates | Where-Object {
    $dir = Join-Path $Stage $_.album
    -not ((Test-Path (Join-Path $dir "$($_.name).*")) -or (Test-Path (Join-Path $dir $_.name)))
  })
  $skipped = $beforeSkip - $candidates.Count
  if ($skipped -gt 0) { Log "skip existing = $skipped（已拷过的不再重复下载）" }
  if ($candidates.Count -eq 0) { Log 'staging 里已经有全部候选了，没有新照片可抽（加 -IncludeExisting 可重新抽）'; return }
}

# ---- 2) 随机抽样（COM 对象不能序列化，抽样后按 album/name 回到目录里取 item） ----
$take = [Math]::Min($Count, $candidates.Count)
$picked = @($candidates | Get-Random -Count $take)
$needByAlbum = @{}
foreach ($p in $picked) {
  if (-not $needByAlbum.ContainsKey($p.album)) { $needByAlbum[$p.album] = New-Object System.Collections.ArrayList }
  [void]$needByAlbum[$p.album].Add($p.name)
}
Log "picked = $($picked.Count) / requested $Count   albums=$($needByAlbum.Keys.Count)"

$manifest = New-Object System.Collections.ArrayList
$ok = 0; $fail = 0; $bytes = 0
$sw = [System.Diagnostics.Stopwatch]::StartNew()

foreach ($albumName in $needByAlbum.Keys) {
  $album = $albums | Where-Object { $_.Name -eq $albumName } | Select-Object -First 1
  if (-not $album) { Log "MISSING ALBUM: $albumName"; continue }
  $wanted = @($needByAlbum[$albumName])
  $destDir = Join-Path $Stage $albumName
  New-Item -ItemType Directory -Force -Path $destDir | Out-Null
  $dest = $shell.NameSpace($destDir)

  # 只枚举这个相册一次，把需要的项挑出来
  $inAlbum = @{}
  foreach ($it in @($album.GetFolder.Items())) { $inAlbum[$it.Name] = $it }

  foreach ($name in $wanted) {
    $item = $inAlbum[$name]
    if (-not $item) { $fail++; Log "MISSING ITEM: $albumName/$name"; continue }
    $before = @(Get-ChildItem $destDir -File -ErrorAction SilentlyContinue).Count
    try {
      $dest.CopyHere($item, 1556)               # 1556 = 不弹窗 + 全部覆盖 + 不显示进度
      $waited = 0
      while ($waited -lt 120000) {
        Start-Sleep -Milliseconds 400
        $waited += 400
        $files = @(Get-ChildItem $destDir -File -ErrorAction SilentlyContinue)
        if ($files.Count -gt $before) {
          $new = $files | Where-Object { $_.Name -like "$name*" } | Select-Object -First 1
          if (-not $new) { $new = $files | Sort-Object LastWriteTime -Descending | Select-Object -First 1 }
          [void]$manifest.Add([pscustomobject]@{
            album = $albumName; deviceName = $name; file = $new.Name; bytes = $new.Length
          })
          $ok++; $bytes += $new.Length
          if ($ok % 5 -eq 0 -or $ok -eq $take) {
            Log ("copied {0}/{1}  {2:n0}MB  {3:n1}MB/s  elapsed={4:n1}min" -f $ok, $take,
                 ($bytes / 1MB), ($bytes / 1MB / [Math]::Max(0.01, $sw.Elapsed.TotalSeconds)), $sw.Elapsed.TotalMinutes)
          }
          break
        }
      }
      if ($waited -ge 120000) { $fail++; Log "TIMEOUT: $albumName/$name" }
    } catch {
      $fail++; Log "FAIL: $albumName/$name — $($_.Exception.Message)"
    }
  }
}

$manifest | ConvertTo-Json -Depth 4 | Set-Content -Path $manifestPath -Encoding UTF8
Log ("done: ok={0} fail={1} size={2:n0}MB elapsed={3:n1}min" -f $ok, $fail, ($bytes / 1MB), $sw.Elapsed.TotalMinutes)
Log "manifest = $manifestPath"
