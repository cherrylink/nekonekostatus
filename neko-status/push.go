package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"neko-status/stat"
)

// 启动主动推送模式
func startPushMode() {
	if Config.Url == "" {
		fmt.Println("未配置面板URL，跳过主动推送")
		return
	}
	
	fmt.Printf("启动主动推送到: %s\n", Config.Url)
	
	ticker := time.NewTicker(2 * time.Second) // 2秒推送一次
	defer ticker.Stop()
	
	for {
		select {
		case <-ticker.C:
			pushStats()
		}
	}
}

// 推送统计数据
func pushStats() {
	// 获取统计数据
	statData, err := stat.GetStat()
	if err != nil {
		fmt.Printf("获取统计数据失败: %v\n", err)
		return
	}
	
	// 构建请求数据
	pushData := map[string]interface{}{
		"sid":  getServerID(),
		"data": statData,
	}
	
	// 序列化数据
	jsonData, err := json.Marshal(pushData)
	if err != nil {
		return
	}
	
	// 发送到面板
	url := Config.Url + "/stats/update"
	resp, err := http.Post(url, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return
	}
	defer resp.Body.Close()
}

// 获取服务器ID
func getServerID() string {
	// 如果配置中有server_id，使用配置的ID
	if Config.ServerID != "" {
		return Config.ServerID
	}
	// 否则使用machine_id作为fallback
	return generateMachineID()
}