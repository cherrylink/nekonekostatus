package main

import (
	"flag"
	"fmt"
	"io/ioutil"
	"log"
	"strconv"

	"neko-status/stat"
	"neko-status/walled"

	"github.com/gin-gonic/gin"
	"gopkg.in/yaml.v2"
)

var (
	Config CONF
)

func resp(c *gin.Context, success bool, data interface{}, code int) {
	c.JSON(code, gin.H{
		"success": success,
		"data":    data,
	})
}
func main() {
	var confpath string
	var show_version bool
	var auto_register bool
	var panel_url string
	var group_name string
	var server_name string
	
	flag.StringVar(&confpath, "c", "", "config path")
	flag.IntVar(&Config.Mode, "mode", 0, "access mode")
	flag.StringVar(&Config.Key, "key", "", "access key")
	flag.IntVar(&Config.Port, "port", 9999, "port")
	flag.BoolVar(&show_version, "v", false, "show version")
	flag.BoolVar(&auto_register, "auto-register", false, "auto register to panel")
	flag.StringVar(&panel_url, "panel", "", "panel url (e.g. http://192.168.1.100:5555)")
	flag.StringVar(&group_name, "group", "", "group name for auto register")
	flag.StringVar(&server_name, "name", "", "server name for auto register")
	flag.Parse()

	if confpath != "" {
		data, err := ioutil.ReadFile(confpath)
		if err != nil {
			log.Panic(err)
		}
		err = yaml.Unmarshal([]byte(data), &Config)
		if err != nil {
			panic(err)
		}
		// fmt.Println(Config)
	}
	if show_version {
		fmt.Println("neko-status v1.0")
		return
	}
	
	// 处理自动注册
	if auto_register {
		if panel_url == "" {
			log.Fatal("自动注册需要指定面板地址，使用 --panel 参数")
		}
		err := AutoRegister(panel_url, group_name, server_name)
		if err != nil {
			log.Fatal("自动注册失败:", err)
		}
		fmt.Println("自动注册成功，开始监控服务...")
	}
	
	go walled.MonitorWalled()
	API()
}
func API() {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(checkKey)
	r.GET("/stat", Stat)
	r.GET("/iperf3", Iperf3)
	r.GET("/iperf3ws", Iperf3Ws)
	r.GET("/walled", Stat)
	fmt.Println("Api port:", Config.Port)
	fmt.Println("Api key:", Config.Key)
	r.Run(":" + strconv.Itoa(Config.Port))
}
func checkKey(c *gin.Context) {
	if c.Request.Header.Get("key") == Config.Key || c.Query("key") == Config.Key {
		c.Next()
	} else {
		resp(c, false, "Api key Incorrect", 500)
		c.Abort()
	}
}

func Stat(c *gin.Context) {
	res, err := stat.GetStat()
	if err == nil {
		resp(c, true, res, 200)
	} else {
		resp(c, false, err, 500)
	}
}
