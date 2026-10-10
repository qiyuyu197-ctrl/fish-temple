#!/usr/bin/env bash
# fish-temple —— 数据备份脚本（systemd 那条路径用；Docker 用法见文末注释）
# --------------------------------------------------------------------------
# 备份什么：仓库 data/ 下的**内容与个人数据**
#   posts/news/gallery/album.json、users/（含邮箱）、forum/、history/、forum-index.json
# 不备份什么：data/.cache/（Pixiv 图片缓存，几百 MB，随时可重建）
#
# 安装：
#   sudo cp deploy/backup.sh /usr/local/bin/fish-temple-backup
#   sudo chmod +x /usr/local/bin/fish-temple-backup
#   sudo /usr/local/bin/fish-temple-backup          # 手动跑一次确认
#   sudo crontab -e                                 # 加一行：15 4 * * * /usr/local/bin/fish-temple-backup >> /var/log/fish-temple-backup.log 2>&1
#
# 可选：再 rsync 一份到异地
#   sudo TARGET=user@backup-host:/backups/fish-temple /usr/local/bin/fish-temple-backup

set -euo pipefail

SRC="${SRC:-/srv/fish-temple/data}"
DEST="${DEST:-/var/backups/fish-temple}"
KEEP="${KEEP:-14}"                  # 保留最近多少份
TARGET="${TARGET:-}"                # 可选：rsync 远端（user@host:/path）
STAMP="$(date +%F_%H%M)"

if [ ! -d "$SRC" ]; then
  echo "找不到数据目录：$SRC（用 SRC=/your/path 覆盖）" >&2
  exit 1
fi

mkdir -p "$DEST"
OUT="$DEST/data-$STAMP.tar.gz"

# 打包：排除缓存；数据目录本身进包里（恢复时解到临时目录再 rsync 回去）
tar czf "$OUT" -C "$(dirname "$SRC")" --exclude='data/.cache' "$(basename "$SRC")"

# 只留最近 $KEEP 份
ls -1t "$DEST"/data-*.tar.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo "备份完成：$OUT（$(du -h "$OUT" | cut -f1)）"

if [ -n "$TARGET" ]; then
  command -v rsync >/dev/null || { echo "没装 rsync，跳过异地备份" >&2; exit 0; }
  rsync -a --delete "$SRC/" "$TARGET/data/"
  echo "异地备份完成：$TARGET/data/"
fi

# ── 恢复步骤（手工执行，别脚本化）────────────────────────────────────
#   sudo systemctl stop fish-temple
#   mkdir -p /tmp/restore && tar xzf /var/backups/fish-temple/data-<时间戳>.tar.gz -C /tmp/restore
#   sudo rsync -av /tmp/restore/data/ /srv/fish-temple/data/
#   sudo chown -R fish:fish /srv/fish-temple/data
#   sudo systemctl start fish-temple
#
# ── Docker 用户 ────────────────────────────────────────────────────
#   数据挂在宿主机 ../data，所以直接对那个目录跑本脚本即可：
#   sudo SRC=/srv/fish-temple/data /usr/local/bin/fish-temple-backup
