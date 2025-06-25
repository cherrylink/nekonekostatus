package main

type CONF struct {
	Mode     int
	Key      string
	Port     int
	Url      string
	Push     bool   // 主动推送模式
	ServerID string // 注册后的服务器ID
}
