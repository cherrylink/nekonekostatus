package main

type CONF struct {
	Mode        int          `yaml:"mode"`
	Key         string       `yaml:"key"`
	Port        int          `yaml:"port"`
	Url         string       `yaml:"url"`
	Push        bool         `yaml:"push"`        // 主动推送模式
	ServerID    string       `yaml:"server_id"`   // 注册后的服务器ID
	Debug       bool         `yaml:"debug"`       // 调试模式
	PingTargets []PingTarget `yaml:"ping_targets"` // 监测目标
}

type PingTarget struct {
	ID       int    `yaml:"id" json:"id"`
	Name     string `yaml:"name" json:"name"`
	Address  string `yaml:"address" json:"address"`
	Port     int    `yaml:"port" json:"port"`
	Interval int    `yaml:"interval" json:"interval"`
}
