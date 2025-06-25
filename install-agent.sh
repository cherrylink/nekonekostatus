#!/bin/bash

# NekoNekoStatus Agent 自动安装脚本

set -e

# 默认值
PANEL_URL=""
GROUP_NAME=""
SERVER_NAME=""
PORT="9999"
AGENT_URL="https://github.com/nkeonkeo/nekonekostatus/releases/download/v0.1/neko-status"

# 显示帮助信息
show_help() {
    cat << EOF
NekoNekoStatus Agent 自动安装脚本

使用方法:
    $0 --panel=http://面板地址:5555 [选项]

必需参数:
    --panel=URL          面板地址 (例: http://192.168.1.100:5555)

可选参数:
    --group=名称         分组名称 (不指定则使用默认分组)
    --name=名称          服务器名称 (不指定则使用主机名)
    --port=端口          Agent端口 (默认: 9999)
    --agent-url=URL      Agent下载地址 (使用自定义编译版本)
    --help               显示此帮助信息

使用示例:
    # 基本安装
    $0 --panel=http://192.168.1.100:5555
    
    # 指定分组和名称
    $0 --panel=http://192.168.1.100:5555 --group=生产环境 --name=Web-01
    
    # 指定端口
    $0 --panel=http://192.168.1.100:5555 --port=8888

EOF
}

# 解析命令行参数
for arg in "$@"; do
    case $arg in
        --panel=*)
            PANEL_URL="${arg#*=}"
            ;;
        --group=*)
            GROUP_NAME="${arg#*=}"
            ;;
        --name=*)
            SERVER_NAME="${arg#*=}"
            ;;
        --port=*)
            PORT="${arg#*=}"
            ;;
        --agent-url=*)
            AGENT_URL="${arg#*=}"
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            echo "未知参数: $arg"
            echo "使用 --help 查看帮助信息"
            exit 1
            ;;
    esac
done

# 检查必需参数
if [ -z "$PANEL_URL" ]; then
    echo "错误: 必须指定面板地址"
    echo "使用 --help 查看帮助信息"
    exit 1
fi

echo "========================================"
echo "NekoNekoStatus Agent 自动安装"
echo "========================================"
echo "面板地址: $PANEL_URL"
echo "分组名称: ${GROUP_NAME:-默认分组}"
echo "服务器名称: ${SERVER_NAME:-$(hostname)}"
echo "Agent端口: $PORT"
echo "========================================"

# 检查系统
if command -v systemctl >/dev/null 2>&1; then
    echo "✓ 检测到 systemd 系统"
else
    echo "✗ 此脚本需要 systemd 支持"
    exit 1
fi

# 检查网络连接
echo "检查网络连接..."
if ! curl -s --connect-timeout 10 "$PANEL_URL" >/dev/null; then
    echo "✗ 无法连接到面板地址: $PANEL_URL"
    echo "请检查网络连接和面板地址是否正确"
    exit 1
fi
echo "✓ 网络连接正常"

# 下载 Agent
echo "下载 NekoNekoStatus Agent..."
if command -v wget >/dev/null 2>&1; then
    wget -O /usr/bin/neko-status "$AGENT_URL" || {
        echo "✗ 下载失败"
        exit 1
    }
elif command -v curl >/dev/null 2>&1; then
    curl -L -o /usr/bin/neko-status "$AGENT_URL" || {
        echo "✗ 下载失败"
        exit 1
    }
else
    echo "✗ 需要 wget 或 curl 来下载文件"
    exit 1
fi

chmod +x /usr/bin/neko-status
echo "✓ Agent 下载完成"

# 停止现有服务
if systemctl is-active --quiet nekonekostatus; then
    echo "停止现有服务..."
    systemctl stop nekonekostatus
fi

# 构建注册命令
REGISTER_CMD="/usr/bin/neko-status --auto-register --panel=$PANEL_URL --port=$PORT"

if [ -n "$GROUP_NAME" ]; then
    REGISTER_CMD="$REGISTER_CMD --group=$GROUP_NAME"
fi

if [ -n "$SERVER_NAME" ]; then
    REGISTER_CMD="$REGISTER_CMD --name=$SERVER_NAME"
fi

# 执行自动注册
echo "正在向面板注册..."
if $REGISTER_CMD; then
    echo "✓ 注册成功"
else
    echo "✗ 注册失败"
    exit 1
fi

# 创建 systemd 服务文件
echo "创建系统服务..."
cat > /etc/systemd/system/nekonekostatus.service << EOF
[Unit]
Description=NekoNekoStatus Agent
After=network.target

[Service]
Type=simple
Restart=always
RestartSec=5
ExecStart=/usr/bin/neko-status -c /etc/neko-status/config.yaml
User=root

[Install]
WantedBy=multi-user.target
EOF

# 重新加载 systemd 并启动服务
systemctl daemon-reload
systemctl enable nekonekostatus
systemctl start nekonekostatus

# 检查服务状态
sleep 2
if systemctl is-active --quiet nekonekostatus; then
    echo "✓ 服务启动成功"
    echo ""
    echo "========================================"
    echo "安装完成！"
    echo "========================================"
    echo "服务状态: systemctl status nekonekostatus"
    echo "查看日志: journalctl -u nekonekostatus -f"
    echo "停止服务: systemctl stop nekonekostatus"
    echo "重启服务: systemctl restart nekonekostatus"
    echo ""
    echo "请在面板中查看服务器是否正常上线"
else
    echo "✗ 服务启动失败"
    echo "查看错误日志: journalctl -u nekonekostatus"
    exit 1
fi