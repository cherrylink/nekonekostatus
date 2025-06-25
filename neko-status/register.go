package main

import (
	"bytes"
	"crypto/md5"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net"
	"net/http"
	"os"
	"runtime"
	"time"

	"neko-status/stat"

	"gopkg.in/yaml.v2"
)

type RegisterRequest struct {
	Hostname    string                 `json:"hostname"`
	IPAddress   string                 `json:"ip_address"`
	SystemInfo  map[string]interface{} `json:"system_info"`
	GroupName   string                 `json:"group_name,omitempty"`
	ServerName  string                 `json:"server_name,omitempty"`
	Port        int                    `json:"port"`
	MachineID   string                 `json:"machine_id"`
}

type RegisterResponse struct {
	Status int                    `json:"status"`
	Msg    string                 `json:"msg"`
	Data   interface{}            `json:"data"`
}

type RegisterData struct {
	SID       string `json:"sid"`
	Name      string `json:"name"`
	APIKey    string `json:"api_key"`
	Port      int    `json:"port"`
	GroupID   int    `json:"group_id"`
	Status    string `json:"status"`
}

// 生成机器唯一标识
func generateMachineID() string {
	// 获取主机名
	hostname, _ := os.Hostname()
	
	// 获取第一个网卡的MAC地址
	interfaces, _ := net.Interfaces()
	var macAddr string
	for _, iface := range interfaces {
		if iface.Flags&net.FlagUp != 0 && iface.Flags&net.FlagLoopback == 0 {
			macAddr = iface.HardwareAddr.String()
			if macAddr != "" {
				break
			}
		}
	}
	
	// 组合唯一标识
	combined := fmt.Sprintf("%s-%s-%s", hostname, macAddr, runtime.GOOS)
	hash := md5.Sum([]byte(combined))
	return fmt.Sprintf("%x", hash)
}

// 获取本机IP地址
func getLocalIP() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return "127.0.0.1"
	}
	defer conn.Close()
	
	localAddr := conn.LocalAddr().(*net.UDPAddr)
	return localAddr.IP.String()
}

// 获取系统信息
func getSystemInfo() map[string]interface{} {
	info := make(map[string]interface{})
	
	// 获取系统统计信息
	if stat_data, err := stat.GetStat(); err == nil {
		info["cpu"] = stat_data["cpu"]
		info["memory"] = stat_data["mem"]
		info["network"] = stat_data["net"]
		info["host"] = stat_data["host"]
		if walled, exists := stat_data["walled"]; exists {
			info["walled"] = walled
		}
	}
	
	info["os"] = runtime.GOOS
	info["arch"] = runtime.GOARCH
	info["go_version"] = runtime.Version()
	info["register_time"] = time.Now().Format("2006-01-02 15:04:05")
	
	return info
}

// 自动注册到面板
func AutoRegister(panelURL, groupName, serverName string) error {
	// 生成机器ID
	machineID := generateMachineID()
	
	// 获取主机信息
	hostname, _ := os.Hostname()
	if hostname == "" {
		hostname = "unknown"
	}
	
	// 获取IP地址
	ipAddress := getLocalIP()
	
	// 获取系统信息
	systemInfo := getSystemInfo()
	
	// 如果没有指定服务器名称，使用主机名
	if serverName == "" {
		serverName = hostname
	}
	
	// 构建注册请求
	registerReq := RegisterRequest{
		Hostname:   hostname,
		IPAddress:  ipAddress,
		SystemInfo: systemInfo,
		GroupName:  groupName,
		ServerName: serverName,
		Port:       Config.Port,
		MachineID:  machineID,
	}
	
	// 序列化请求数据
	jsonData, err := json.Marshal(registerReq)
	if err != nil {
		return fmt.Errorf("序列化注册数据失败: %v", err)
	}
	
	// 发送注册请求
	resp, err := http.Post(
		panelURL+"/api/auto-register",
		"application/json",
		bytes.NewBuffer(jsonData),
	)
	if err != nil {
		return fmt.Errorf("发送注册请求失败: %v", err)
	}
	defer resp.Body.Close()
	
	// 读取响应
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("读取响应失败: %v", err)
	}
	
	// 打印响应内容用于调试
	fmt.Printf("服务器响应: %s\n", string(body))
	
	// 解析响应
	var registerResp RegisterResponse
	err = json.Unmarshal(body, &registerResp)
	if err != nil {
		return fmt.Errorf("解析响应失败: %v\n响应内容: %s", err, string(body))
	}
	
	// 检查注册结果
	if registerResp.Status != 1 {
		return fmt.Errorf("注册失败: %s", registerResp.Msg)
	}
	
	// 检查返回的数据类型
	switch data := registerResp.Data.(type) {
	case string:
		// 服务器已存在，返回字符串消息
		fmt.Printf("注册结果: %s\n", data)
		fmt.Printf("服务器已存在，配置已更新。使用现有配置启动服务。\n")
		return nil
		
	case map[string]interface{}:
		// 新注册，返回详细信息
		var regData RegisterData
		
		// 手动解析map到结构体
		if sid, ok := data["sid"].(string); ok {
			regData.SID = sid
		}
		if name, ok := data["name"].(string); ok {
			regData.Name = name
		}
		if apiKey, ok := data["api_key"].(string); ok {
			regData.APIKey = apiKey
		}
		if port, ok := data["port"].(float64); ok {
			regData.Port = int(port)
		}
		if groupID, ok := data["group_id"].(float64); ok {
			regData.GroupID = int(groupID)
		}
		if status, ok := data["status"].(string); ok {
			regData.Status = status
		}
		
		// 更新配置
		Config.Key = regData.APIKey
		Config.Port = regData.Port
		Config.Url = panelURL  // 保存面板地址用于主动推送
		Config.Push = true     // 启用主动推送模式
		
		// 保存配置到文件
		err = saveConfig(machineID, regData)
		if err != nil {
			fmt.Printf("保存配置失败: %v\n", err)
		}
		
		fmt.Printf("注册成功:\n")
		fmt.Printf("  服务器ID: %s\n", regData.SID)
		fmt.Printf("  服务器名称: %s\n", regData.Name)
		fmt.Printf("  API密钥: %s\n", regData.APIKey)
		fmt.Printf("  端口: %d\n", regData.Port)
		
	default:
		return fmt.Errorf("未知的响应数据格式")
	}
	
	return nil
}

// 保存配置到文件
func saveConfig(machineID string, data RegisterData) error {
	// 创建配置目录
	configDir := "/etc/neko-status"
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return err
	}
	
	// 创建配置内容
	config := map[string]interface{}{
		"key":        data.APIKey,
		"port":       data.Port,
		"url":        Config.Url,
		"push":       true,  // 启用主动推送
		"debug":      false,
		"machine_id": machineID,
		"server_id":  data.SID,
		"registered": true,
	}
	
	// 序列化为YAML
	yamlData, err := yaml.Marshal(config)
	if err != nil {
		return err
	}
	
	// 写入配置文件
	configFile := configDir + "/config.yaml"
	err = ioutil.WriteFile(configFile, yamlData, 0644)
	if err != nil {
		return err
	}
	
	fmt.Printf("配置已保存到: %s\n", configFile)
	return nil
}