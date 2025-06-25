"use strict";
const ssh=require("../../ssh");
const schedule=require("node-schedule");

module.exports=svr=>{
const {db,pr}=svr.locals;

// 每小时清理超过72小时的ping数据
schedule.scheduleJob('0 * * * *', () => {
    try {
        const result = db.ping_data.cleanup(3); // 3天=72小时
        console.log(`清理旧ping数据: 删除了${result.changes}条记录`);
    } catch(e) {
        console.error('清理ping数据失败:', e);
    }
});

// 线路监测总览页面
svr.get("/admin/line-monitoring",(req,res)=>{
    res.render("admin/line_monitoring");
});

// 获取所有服务器列表API
svr.get("/api/servers",(req,res)=>{
    try {
        const servers = db.servers.all();
        const serverData = servers.map(server => ({
            sid: server.sid,
            name: server.name,
            location: server.location,
            type: server.type,
            region: server.region
        }));
        res.json(pr(1, serverData));
    } catch(e) {
        res.json(pr(0, '获取服务器列表失败: ' + e.message));
    }
});

// 实时监测数据流 (Server-Sent Events)
svr.get("/api/ping-stream",(req,res)=>{
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });
    
    // 发送初始连接事件
    res.write('data: ' + JSON.stringify({
        type: 'connected',
        message: '实时数据流已连接',
        timestamp: new Date().toISOString()
    }) + '\n\n');
    
    // 创建客户端标识
    const clientId = Date.now() + Math.random();
    console.log(`实时数据流客户端连接: ${clientId}`);
    
    // 保存客户端连接以便广播
    if (!svr.locals.sseClients) {
        svr.locals.sseClients = new Map();
    }
    svr.locals.sseClients.set(clientId, res);
    
    // 定期发送心跳
    const heartbeat = setInterval(() => {
        try {
            res.write('data: ' + JSON.stringify({
                type: 'heartbeat',
                timestamp: new Date().toISOString()
            }) + '\n\n');
        } catch(e) {
            clearInterval(heartbeat);
            svr.locals.sseClients.delete(clientId);
        }
    }, 30000);
    
    // 客户端断开连接处理
    req.on('close', () => {
        console.log(`实时数据流客户端断开: ${clientId}`);
        clearInterval(heartbeat);
        svr.locals.sseClients.delete(clientId);
    });
    
    req.on('end', () => {
        console.log(`实时数据流结束: ${clientId}`);
        clearInterval(heartbeat);
        svr.locals.sseClients.delete(clientId);
    });
});

// 广播函数
if (!svr.locals.broadcast) {
    svr.locals.broadcast = (eventType, data) => {
        if (svr.locals.sseClients && svr.locals.sseClients.size > 0) {
            const message = JSON.stringify({
                type: eventType,
                data: data,
                timestamp: new Date().toISOString()
            });
            
            console.log(`广播事件 ${eventType} 给 ${svr.locals.sseClients.size} 个客户端`);
            
            svr.locals.sseClients.forEach((clientRes, clientId) => {
                try {
                    clientRes.write('data: ' + message + '\n\n');
                } catch(e) {
                    console.log(`客户端 ${clientId} 连接异常，移除`);
                    svr.locals.sseClients.delete(clientId);
                }
            });
        }
    };
}

// 获取服务器的监测配置
svr.get("/admin/servers/:sid/ping-config",(req,res)=>{
    var {sid} = req.params;
    const server = db.servers.get(sid);
    if(!server){
        res.json(pr(0, '服务器不存在'));
        return;
    }
    
    const configs = db.server_ping_config.getByServer(sid);
    const allTargets = db.ping_targets.all();
    
    // 为每个目标创建配置映射，方便模板使用
    const configMap = {};
    configs.forEach(config => {
        configMap[config.target_id] = config;
    });
    
    res.render("admin/server_ping_config", {
        server: server,
        configs: configs,
        allTargets: allTargets,
        configMap: configMap
    });
});

// 获取服务器监测配置API
svr.get("/api/servers/:sid/ping-config",(req,res)=>{
    var {sid} = req.params;
    const configs = db.server_ping_config.getByServer(sid);
    res.json(pr(1, configs));
});

// 设置服务器监测配置
svr.post("/admin/servers/:sid/ping-config",async(req,res)=>{
    var {sid} = req.params;
    var {configs} = req.body; // configs 是数组: [{target_id, enabled, interval_seconds}]
    
    const server = db.servers.get(sid);
    if(!server){
        res.json(pr(0, '服务器不存在'));
        return;
    }
    
    try {
        // 清除现有配置
        db.server_ping_config.delByServer(sid);
        
        // 添加新配置
        if(configs && configs.length > 0){
            for(let config of configs){
                if(config.enabled){
                    db.server_ping_config.set(
                        sid, 
                        config.target_id, 
                        1, 
                        config.interval_seconds || 30
                    );
                }
            }
        }
        
        res.json(pr(1, '配置保存成功'));
    } catch(e) {
        res.json(pr(0, '配置保存失败: ' + e.message));
    }
});

// 同步配置到agent
svr.post("/admin/servers/:sid/sync-ping",async(req,res)=>{
    var {sid} = req.params;
    const server = db.servers.get(sid);
    if(!server){
        res.json(pr(0, '服务器不存在'));
        return;
    }
    
    try {
        // 获取启用的监测配置
        const configs = db.server_ping_config.getEnabled(sid);
        
        // 构建配置文件内容
        let configYaml = `key: ${server.data.api.key}
port: ${server.data.api.port}
debug: false`;

        // 添加必要的URL和server_id信息
        const panelUrl = `http://${req.get('host')}`;
        configYaml += `\nurl: ${panelUrl}`;
        configYaml += `\nserver_id: ${server.sid}`;
        configYaml += `\npush: true`;
        
        if(configs.length > 0){
            configYaml += '\nping_targets:';
            for(let config of configs){
                configYaml += `
  - id: ${config.target_id}
    name: "${config.name}"
    address: "${config.address}"
    port: ${config.port}
    interval: ${config.interval_seconds}`;
            }
        }
        
        // 通过SSH更新配置文件，使用heredoc避免引号问题
        const updateConfigCmd = `cat > /etc/neko-status/config.yaml << 'EOF'
${configYaml}
EOF
systemctl restart nekonekostatus`;

        console.log('同步配置到Agent:', server.name);
        console.log('配置内容:', configYaml);
        
        const result = await ssh.Exec(server.data.ssh, updateConfigCmd);
        
        if(result.success){
            res.json(pr(1, '配置同步成功，agent已重启'));
        } else {
            res.json(pr(0, '配置同步失败: ' + (result.error || 'SSH执行失败')));
        }
        
    } catch(e) {
        res.json(pr(0, '配置同步失败: ' + e.message));
    }
});

// Agent上报监测数据
svr.post("/api/ping-data",async(req,res)=>{
    var {sid, data} = req.body;
    
    console.log(`收到ping数据上报: sid=${sid}, data长度=${data ? data.length : 'undefined'}`);
    console.log('上报数据详情:', JSON.stringify(req.body, null, 2));
    
    if(!sid || !data){
        console.log('参数错误: sid或data为空');
        res.json(pr(0, '参数错误'));
        return;
    }
    
    try {
        // data是数组，包含多个监测结果
        if(Array.isArray(data)){
            console.log(`处理${data.length}个ping结果`);
            for(let pingResult of data){
                console.log(`保存ping数据: target_id=${pingResult.target_id}, ip_version=${pingResult.ip_version}, packet_loss=${pingResult.packet_loss}`);
                db.ping_data.ins(
                    sid,
                    pingResult.target_id,
                    pingResult.ip_version,
                    pingResult.packets_sent,
                    pingResult.packets_received,
                    pingResult.packet_loss,
                    pingResult.rtt_min,
                    pingResult.rtt_avg,
                    pingResult.rtt_max
                );
            }
            console.log('所有ping数据保存完成');
            
            // 广播实时数据更新通知
            if (svr.locals.broadcast) {
                svr.locals.broadcast('ping_data_update', {
                    server_id: sid,
                    data: data,
                    timestamp: new Date().toISOString()
                });
            }
        }
        
        res.json(pr(1, '数据接收成功'));
    } catch(e) {
        console.error('保存ping数据失败:', e);
        res.json(pr(0, '数据保存失败'));
    }
});

// 获取监测数据
svr.get("/api/servers/:sid/ping-data",(req,res)=>{
    var {sid} = req.params;
    var {target_id, hours = 24} = req.query;
    
    console.log(`获取ping数据请求: sid=${sid}, target_id=${target_id}, hours=${hours}`);
    
    try {
        let data;
        if(target_id){
            data = db.ping_data.getByTarget(sid, target_id, parseInt(hours));
        } else {
            data = db.ping_data.getByServer(sid, parseInt(hours));
        }
        
        console.log(`返回ping数据: ${data.length}条记录`);
        res.json(pr(1, data));
    } catch(e) {
        console.error('获取ping数据失败:', e);
        res.json(pr(0, '获取数据失败: ' + e.message));
    }
});

// 获取监测统计
svr.get("/api/servers/:sid/ping-stats",(req,res)=>{
    var {sid} = req.params;
    var {target_id, hours = 24} = req.query;
    
    if(!target_id){
        res.json(pr(0, '需要指定目标ID'));
        return;
    }
    
    try {
        const stats = db.ping_data.getStats(sid, target_id, parseInt(hours));
        res.json(pr(1, stats));
    } catch(e) {
        res.json(pr(0, '获取统计失败: ' + e.message));
    }
});

// 测试API - 直接查询数据库
svr.get("/api/ping-test",(req,res)=>{
    try {
        // 检查表是否存在
        const tables = db.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%ping%'").all();
        console.log('ping相关表:', tables);
        
        // 检查ping_data表结构
        const schema = db.DB.prepare("PRAGMA table_info(ping_data)").all();
        console.log('ping_data表结构:', schema);
        
        // 查询数据
        const allData = db.DB.prepare("SELECT * FROM ping_data ORDER BY timestamp DESC LIMIT 10").all();
        console.log('数据库中的ping数据:', allData);
        
        res.json({
            status: 1, 
            tables: tables,
            schema: schema,
            data: allData, 
            count: allData.length
        });
    } catch(e) {
        console.error('查询失败:', e);
        res.json({status: 0, error: e.message, stack: e.stack});
    }
});
}