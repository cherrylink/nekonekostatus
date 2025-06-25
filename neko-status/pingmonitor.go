package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"runtime"
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

// monitorTarget 监测单个目标（优化版本）
func (pm *PingMonitor) monitorTarget(target PingTarget, stopChan chan bool) {
	interval := time.Duration(target.Interval) * time.Second
	if interval < 30*time.Second {
		interval = 30 * time.Second // 最小间隔提高到30秒
	}
	
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	
	if Config.Debug {
		fmt.Printf("开始监测目标: %s (%s:%d), 间隔: %v\n", target.Name, target.Address, target.Port, interval)
	}
	
	// 延迟随机时间启动，避免所有目标同时执行
	randomDelay := time.Duration(target.ID%10) * time.Second
	time.Sleep(randomDelay)
	
	// 立即执行一次
	pm.pingTarget(target)
	
	for {
		select {
		case <-ticker.C:
			// 执行检测
			pm.pingTargetWithRetry(target)
			
		case <-stopChan:
			if Config.Debug {
				fmt.Printf("停止监测目标: %s\n", target.Name)
			}
			return
		}
	}
}

// pingTargetWithRetry 带重试的ping检测
func (pm *PingMonitor) pingTargetWithRetry(target PingTarget) []tcpping.PingResult {
	// 执行检测
	results := tcpping.TCPPingBoth(target.ID, target.Address, target.Port, 3, 3*time.Second)
	
	if len(results) > 0 {
		// 上报结果到后端
		pm.reportResults(results)
		
		// 只在Debug模式或有异常时输出详细结果
		for _, result := range results {
			if Config.Debug || result.PacketLoss > 0.1 {
				fmt.Printf("监测结果 - 目标:%s IPv%d 发送:%d 接收:%d 丢包率:%.1f%% 平均延迟:%.1fms\n", 
					target.Name, result.IPVersion, result.PacketsSent, result.PacketsReceived,
					result.PacketLoss*100, result.RTTAvg)
			}
		}
	} else {
		// 失败时输出简化日志
		fmt.Printf("目标 %s 检测失败\n", target.Name)
	}
	
	return results
}

// pingTarget 对单个目标执行ping（兼容旧版本调用）
func (pm *PingMonitor) pingTarget(target PingTarget) {
	pm.pingTargetWithRetry(target)
}

// reportResults 上报监测结果到后端（优化版本）
func (pm *PingMonitor) reportResults(results []tcpping.PingResult) {
	if Config.Url == "" || Config.ServerID == "" {
		if Config.Debug {
			fmt.Printf("上报失败: URL=%s, ServerID=%s\n", Config.Url, Config.ServerID)
		}
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
		fmt.Printf("序列化ping数据失败: %v\n", err)
		return
	}
	
	// 发送到后端
	url := Config.Url + "/api/ping-data"
	if Config.Debug {
		fmt.Printf("正在上报ping数据到: %s\n", url)
	}
	
	// 使用更短的超时时间
	client := &http.Client{
		Timeout: 10 * time.Second,
	}
	
	resp, err := client.Post(url, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		fmt.Printf("上报ping数据失败: %v\n", err)
		return
	}
	defer resp.Body.Close()
	
	// 只在Debug模式或失败时输出日志
	if Config.Debug || resp.StatusCode != 200 {
		fmt.Printf("ping数据上报结果: %d个结果, HTTP状态: %d\n", len(results), resp.StatusCode)
	}
}

// 全局监测器实例
var pingMonitor *PingMonitor

// 初始化ping监测器
func initPingMonitor() {
	pingMonitor = NewPingMonitor()
	
	if Config.Debug {
		fmt.Println("线路监测优化已启用 (Debug模式)")
	}
	
	// 设置GOMAXPROCS限制CPU使用
	runtime.GOMAXPROCS(2)
	
	// 如果配置中有监测目标，启动监测
	if len(Config.PingTargets) > 0 {
		fmt.Printf("启动 %d 个监测目标\n", len(Config.PingTargets))
		pingMonitor.UpdateTargets(Config.PingTargets)
		pingMonitor.Start()
		
	}
}

