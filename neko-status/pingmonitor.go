package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"neko-status/tcpping"
)

// PingMonitor 管理所有的ping监测任务
type PingMonitor struct {
	targets    []PingTarget
	stopChans  map[int]chan bool
	mutex      sync.RWMutex
	isRunning  bool
}

// NewPingMonitor 创建新的ping监测器
func NewPingMonitor() *PingMonitor {
	return &PingMonitor{
		stopChans: make(map[int]chan bool),
	}
}

// UpdateTargets 更新监测目标
func (pm *PingMonitor) UpdateTargets(targets []PingTarget) {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()
	
	// 停止现有的监测任务
	for _, stopChan := range pm.stopChans {
		close(stopChan)
	}
	pm.stopChans = make(map[int]chan bool)
	
	// 更新目标列表
	pm.targets = targets
	
	// 启动新的监测任务
	if pm.isRunning {
		pm.startMonitoring()
	}
}

// Start 启动监测
func (pm *PingMonitor) Start() {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()
	
	if pm.isRunning {
		return
	}
	
	pm.isRunning = true
	pm.startMonitoring()
	
	fmt.Println("线路监测已启动")
}

// Stop 停止监测
func (pm *PingMonitor) Stop() {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()
	
	if !pm.isRunning {
		return
	}
	
	pm.isRunning = false
	
	// 停止所有监测任务
	for _, stopChan := range pm.stopChans {
		close(stopChan)
	}
	pm.stopChans = make(map[int]chan bool)
	
	fmt.Println("线路监测已停止")
}

// startMonitoring 启动监测任务（内部方法，需要已获得锁）
func (pm *PingMonitor) startMonitoring() {
	for _, target := range pm.targets {
		stopChan := make(chan bool)
		pm.stopChans[target.ID] = stopChan
		
		// 为每个目标启动独立的goroutine
		go pm.monitorTarget(target, stopChan)
	}
}

// monitorTarget 监测单个目标
func (pm *PingMonitor) monitorTarget(target PingTarget, stopChan chan bool) {
	interval := time.Duration(target.Interval) * time.Second
	if interval < 10*time.Second {
		interval = 30 * time.Second // 最小间隔30秒
	}
	
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	
	fmt.Printf("开始监测目标: %s (%s:%d), 间隔: %v\n", target.Name, target.Address, target.Port, interval)
	
	// 立即执行一次
	pm.pingTarget(target)
	
	for {
		select {
		case <-ticker.C:
			pm.pingTarget(target)
		case <-stopChan:
			fmt.Printf("停止监测目标: %s\n", target.Name)
			return
		}
	}
}

// pingTarget 对单个目标执行ping
func (pm *PingMonitor) pingTarget(target PingTarget) {
	// 执行TCP ping，测试5次，超时5秒
	results := tcpping.TCPPingBoth(target.ID, target.Address, target.Port, 5, 5*time.Second)
	
	if len(results) > 0 {
		// 上报结果到后端
		pm.reportResults(results)
		
		for _, result := range results {
			if Config.Debug {
				fmt.Printf("监测结果 - 目标:%s IPv%d 丢包率:%.1f%% 平均延迟:%.1fms\n", 
					target.Name, result.IPVersion, result.PacketLoss*100, result.RTTAvg)
			}
		}
	}
}

// reportResults 上报监测结果到后端
func (pm *PingMonitor) reportResults(results []tcpping.PingResult) {
	if Config.Url == "" || Config.ServerID == "" {
		return
	}
	
	// 构建上报数据
	reportData := map[string]interface{}{
		"sid":  Config.ServerID,
		"data": results,
	}
	
	// 序列化数据
	jsonData, err := json.Marshal(reportData)
	if err != nil {
		if Config.Debug {
			fmt.Printf("序列化ping数据失败: %v\n", err)
		}
		return
	}
	
	// 发送到后端
	url := Config.Url + "/api/ping-data"
	resp, err := http.Post(url, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		if Config.Debug {
			fmt.Printf("上报ping数据失败: %v\n", err)
		}
		return
	}
	defer resp.Body.Close()
	
	if Config.Debug {
		fmt.Printf("ping数据上报成功: %d个结果\n", len(results))
	}
}

// 全局监测器实例
var pingMonitor *PingMonitor

// 初始化ping监测器
func initPingMonitor() {
	pingMonitor = NewPingMonitor()
	
	// 如果配置中有监测目标，启动监测
	if len(Config.PingTargets) > 0 {
		pingMonitor.UpdateTargets(Config.PingTargets)
		pingMonitor.Start()
	}
}