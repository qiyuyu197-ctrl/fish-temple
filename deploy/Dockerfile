# fish-temple —— 可选的 Docker 镜像
# ------------------------------------------------------------------
# 只在你更喜欢容器时使用（systemd 那条是主路径，见 deploy/README.md）。
#
# ⚠️ 两个关键点：
#   ① **不要**在这里 npm install —— 站点零依赖；唯一的 npm 依赖 @netlify/blobs
#      只在 Netlify 上被动态引入，容器里根本不会加载它。
#   ② **data/ 必须挂成 volume**（见 docker-compose.yml）。容器内的文件系统是临时的：
#      不挂卷的话，容器一重建，论坛帖、账号资料、播放历史全没。
#
# 构建上下文是**仓库根目录**（因为要 COPY 整个站点）：
#   docker build -f deploy/Dockerfile -t fish-temple:local .

FROM node:20-alpine

WORKDIR /app

# 站点是"仓库根即发布内容"：源码、静态资源、data/ 一起拷进来（.git 也会进来，介意的话可自行过滤）
COPY . .

# 让 node 用户（镜像自带，uid 1000）能写 data/ —— 应用要往这里落内容、账号、论坛、历史
RUN mkdir -p /app/data && chown -R node:node /app

# 不用 root 跑
USER node

# 容器里没有反代，所以绑所有网卡；对外只暴露给 compose 映射的那个端口
ENV PORT=5173 \
    HOST=0.0.0.0 \
    NODE_ENV=production

EXPOSE 5173

# 健康检查：/api/health 是应用自带的，返回 JSON（deploy/storage/writable 等字段）
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5173)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# 静态站没有构建步骤，直接跑源码；SIGTERM 由 server.mjs 里的优雅退出处理
CMD ["node", "server.mjs"]
