package tcpping

import (
	"fmt"
	"net"
	"time"
)

// PingResult 包含ping结果的结构
type PingResult struct {
	TargetID        int     `json:"target_id"`
	IPVersion       int     `json:"ip_version"`
	PacketsSent     int     `json:"packets_sent"`
	PacketsReceived int     `json:"packets_received"`
	PacketLoss      float64 `json:"packet_loss"`
	RTTMin          float64 `json:"rtt_min"`
	RTTAvg          float64 `json:"rtt_avg"`
	RTTMax          float64 `json:"rtt_max"`
	Error           string  `json:"error,omitempty"`
}

// TCPPing 执行TCP ping操作
func TCPPing(targetID int, address string, port int, count int, timeout time.Duration) PingResult {
	result := PingResult{
		TargetID:    targetID,
		PacketsSent: count,
	}
	
	var rtts []float64
	successCount := 0
	
	// 确定目标地址格式
	target := fmt.Sprintf("%s:%d", address, port)
	
	for i := 0; i < count; i++ {
		start := time.Now()
		
		// 尝试IPv4连接
		conn, err := net.DialTimeout("tcp4", target, timeout)
		if err != nil {
			// 如果IPv4失败，尝试IPv6
			conn, err = net.DialTimeout("tcp6", target, timeout)
			if err != nil {
				continue
			}
			result.IPVersion = 6
		} else {
			result.IPVersion = 4
		}
		
		// 计算RTT
		rtt := float64(time.Since(start).Nanoseconds()) / 1000000.0 // 转换为毫秒
		rtts = append(rtts, rtt)
		successCount++
		
		conn.Close()
		
		// 间隔500ms再进行下一次ping，减少CPU压力
		if i < count-1 {
			time.Sleep(500 * time.Millisecond)
		}
	}
	
	result.PacketsReceived = successCount
	result.PacketLoss = float64(count-successCount) / float64(count)
	
	// 计算RTT统计
	if len(rtts) > 0 {
		var sum, min, max float64
		min = rtts[0]
		max = rtts[0]
		
		for _, rtt := range rtts {
			sum += rtt
			if rtt < min {
				min = rtt
			}
			if rtt > max {
				max = rtt
			}
		}
		
		result.RTTAvg = sum / float64(len(rtts))
		result.RTTMin = min
		result.RTTMax = max
	}
	
	return result
}

// TCPPingBoth 智能测试IPv4和IPv6（优化版本）
func TCPPingBoth(targetID int, address string, port int, count int, timeout time.Duration) []PingResult {
	var results []PingResult
	
	// 首先尝试快速连接测试，确定可用的IP版本
	target := fmt.Sprintf("%s:%d", address, port)
	
	// 快速检测IPv4可用性
	ipv4Available := false
	if conn, err := net.DialTimeout("tcp4", target, 2*time.Second); err == nil {
		conn.Close()
		ipv4Available = true
	}
	
	// 快速检测IPv6可用性  
	ipv6Available := false
	if conn, err := net.DialTimeout("tcp6", target, 2*time.Second); err == nil {
		conn.Close()
		ipv6Available = true
	}
	
	// 只测试可用的IP版本，优先IPv4
	if ipv4Available {
		ipv4Result := tcpPingSpecific(targetID, address, port, count, timeout, "tcp4", 4)
		results = append(results, ipv4Result)
	} else if ipv6Available {
		ipv6Result := tcpPingSpecific(targetID, address, port, count, timeout, "tcp6", 6)
		results = append(results, ipv6Result)
	}
	
	// 如果都失败了，返回一个失败结果
	if len(results) == 0 {
		results = append(results, PingResult{
			TargetID:        targetID,
			IPVersion:       4,
			PacketsSent:     count,
			PacketsReceived: 0,
			PacketLoss:      1.0,
			Error:           "No available IP version",
		})
	}
	
	return results
}

// tcpPingSpecific 对指定IP版本进行ping
func tcpPingSpecific(targetID int, address string, port int, count int, timeout time.Duration, network string, ipVersion int) PingResult {
	result := PingResult{
		TargetID:    targetID,
		IPVersion:   ipVersion,
		PacketsSent: count,
	}
	
	var rtts []float64
	successCount := 0
	target := fmt.Sprintf("%s:%d", address, port)
	
	for i := 0; i < count; i++ {
		start := time.Now()
		
		conn, err := net.DialTimeout(network, target, timeout)
		if err != nil {
			continue
		}
		
		// 计算RTT
		rtt := float64(time.Since(start).Nanoseconds()) / 1000000.0 // 转换为毫秒
		rtts = append(rtts, rtt)
		successCount++
		
		conn.Close()
		
		// 间隔500ms再进行下一次ping，减少CPU压力
		if i < count-1 {
			time.Sleep(500 * time.Millisecond)
		}
	}
	
	result.PacketsReceived = successCount
	result.PacketLoss = float64(count-successCount) / float64(count)
	
	// 计算RTT统计
	if len(rtts) > 0 {
		var sum, min, max float64
		min = rtts[0]
		max = rtts[0]
		
		for _, rtt := range rtts {
			sum += rtt
			if rtt < min {
				min = rtt
			}
			if rtt > max {
				max = rtt
			}
		}
		
		result.RTTAvg = sum / float64(len(rtts))
		result.RTTMin = min
		result.RTTMax = max
	}
	
	return result
}