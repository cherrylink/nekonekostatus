package stat

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"neko-status/walled"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/shirou/gopsutil/cpu"
	"github.com/shirou/gopsutil/host"
	"github.com/shirou/gopsutil/mem"
	"github.com/shirou/gopsutil/net"
)

// ASN信息结构
type ASNInfo struct {
	IP      string `json:"ip"`
	ASN     string `json:"asn"`
	Org     string `json:"org"`
	Country string `json:"country"`
	City    string `json:"city"`
}

// 获取公网IP的ASN信息
func getASNInfo() ASNInfo {
	// 首先获取公网IP
	publicIP := getPublicIP()
	if publicIP == "" {
		return ASNInfo{}
	}
	
	// 使用ipinfo.io获取ASN信息
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(fmt.Sprintf("https://ipinfo.io/%s/json", publicIP))
	if err != nil {
		return ASNInfo{IP: publicIP}
	}
	defer resp.Body.Close()
	
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return ASNInfo{IP: publicIP}
	}
	
	var info map[string]interface{}
	if err := json.Unmarshal(body, &info); err != nil {
		return ASNInfo{IP: publicIP}
	}
	
	result := ASNInfo{IP: publicIP}
	if org, ok := info["org"].(string); ok {
		// org格式通常是 "AS13335 Cloudflare, Inc."
		parts := strings.SplitN(org, " ", 2)
		if len(parts) >= 1 {
			result.ASN = parts[0]
		}
		if len(parts) >= 2 {
			result.Org = parts[1]
		}
	}
	if country, ok := info["country"].(string); ok {
		result.Country = country
	}
	if city, ok := info["city"].(string); ok {
		result.City = city
	}
	
	return result
}

// 获取公网IP
func getPublicIP() string {
	services := []string{
		"https://api.ipify.org",
		"https://ifconfig.me",
		"https://icanhazip.com",
	}
	
	client := &http.Client{Timeout: 3 * time.Second}
	for _, service := range services {
		resp, err := client.Get(service)
		if err != nil {
			continue
		}
		
		body, err := ioutil.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			continue
		}
		
		ip := strings.TrimSpace(string(body))
		if ip != "" {
			return ip
		}
	}
	return ""
}

// 获取TCP/UDP连接数统计
func getConnectionStats() map[string]int {
	stats := map[string]int{
		"tcp_established": 0,
		"tcp_listen":      0,
		"tcp_time_wait":   0,
		"tcp_close_wait":  0,
		"udp_total":       0,
	}
	
	// 获取TCP连接统计
	if connections, err := net.Connections("tcp"); err == nil {
		for _, conn := range connections {
			switch conn.Status {
			case "ESTABLISHED":
				stats["tcp_established"]++
			case "LISTEN":
				stats["tcp_listen"]++
			case "TIME_WAIT":
				stats["tcp_time_wait"]++
			case "CLOSE_WAIT":
				stats["close_wait"]++
			}
		}
	}
	
	// 获取UDP连接统计
	if connections, err := net.Connections("udp"); err == nil {
		stats["udp_total"] = len(connections)
	}
	
	// 如果gopsutil获取失败，尝试使用netstat命令
	if stats["tcp_established"] == 0 && stats["udp_total"] == 0 {
		getConnectionStatsFromNetstat(stats)
	}
	
	return stats
}

// 通过netstat命令获取连接统计（备用方案）
func getConnectionStatsFromNetstat(stats map[string]int) {
	// TCP统计
	if out, err := exec.Command("sh", "-c", "netstat -ant | awk 'NR>2 {print $6}' | sort | uniq -c").Output(); err == nil {
		lines := strings.Split(strings.TrimSpace(string(out)), "\n")
		for _, line := range lines {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				count, _ := strconv.Atoi(parts[0])
				state := parts[1]
				switch state {
				case "ESTABLISHED":
					stats["tcp_established"] = count
				case "LISTEN":
					stats["tcp_listen"] = count
				case "TIME_WAIT":
					stats["tcp_time_wait"] = count
				case "CLOSE_WAIT":
					stats["tcp_close_wait"] = count
				}
			}
		}
	}
	
	// UDP统计
	if out, err := exec.Command("sh", "-c", "netstat -anu | grep -c udp").Output(); err == nil {
		if count, err := strconv.Atoi(strings.TrimSpace(string(out))); err == nil {
			stats["udp_total"] = count
		}
	}
}

func GetStat() (map[string]interface{}, error) {
	timer := time.NewTimer(500 * time.Millisecond)
	res := gin.H{
		"walled": walled.Walled,
	}
	CPU1, err := cpu.Times(true)
	if err != nil {
		return nil, err
	}
	NET1, err := net.IOCounters(true)
	if err != nil {
		return nil, err
	}
	<-timer.C
	CPU2, err := cpu.Times(true)
	if err != nil {
		return nil, err
	}
	NET2, err := net.IOCounters(true)
	if err != nil {
		return nil, err
	}
	MEM, err := mem.VirtualMemory()
	if err != nil {
		return nil, err
	}
	SWAP, err := mem.SwapMemory()
	if err != nil {
		return nil, err
	}
	res["mem"] = gin.H{
		"virtual": MEM,
		"swap":    SWAP,
	}

	single := make([]float64, len(CPU1))
	var idle, total, multi float64
	idle, total = 0, 0
	for i, c1 := range CPU1 {
		c2 := CPU2[i]
		single[i] = 1 - (c2.Idle-c1.Idle)/(c2.Total()-c1.Total())
		idle += c2.Idle - c1.Idle
		total += c2.Total() - c1.Total()
	}
	multi = 1 - idle/total
	// info, err := cpu.Info()
	// if err != nil {
	// 	return nil, err
	// }
	res["cpu"] = gin.H{
		// "info":   info,
		"multi":  multi,
		"single": single,
	}

	var in, out, in_total, out_total uint64
	in, out, in_total, out_total = 0, 0, 0, 0
	res["net"] = gin.H{
		"devices": gin.H{},
	}
	for i, x := range NET2 {
		_in := x.BytesRecv - NET1[i].BytesRecv
		_out := x.BytesSent - NET1[i].BytesSent
		res["net"].(gin.H)["devices"].(gin.H)[x.Name] = gin.H{
			"delta": gin.H{
				"in":  float64(_in) / 0.5,
				"out": float64(_out) / 0.5,
			},
			"total": gin.H{
				"in":  x.BytesRecv,
				"out": x.BytesSent,
			},
		}
		if x.Name == "lo" {
			continue
		}
		in += _in
		out += _out
		in_total += x.BytesRecv
		out_total += x.BytesSent
	}
	res["net"].(gin.H)["delta"] = gin.H{
		"in":  float64(in) / 0.5,
		"out": float64(out) / 0.5,
	}
	res["net"].(gin.H)["total"] = gin.H{
		"in":  in_total,
		"out": out_total,
	}
	host, err := host.Info()
	if err != nil {
		return nil, err
	}
	res["host"] = host
	
	// 添加ASN信息
	res["asn"] = getASNInfo()
	
	// 添加连接统计
	res["connections"] = getConnectionStats()

	return res, nil
}
