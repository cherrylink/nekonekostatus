package main

type CONF struct {
	Mode int
	Key  string
	Port int
	Url  string
	Push bool   // 主动推送模式
}
