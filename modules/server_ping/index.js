"use strict";
const ssh=require("../../ssh");

module.exports=svr=>{
const {db,pr}=svr.locals;

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
        const allData = db.ping_data.DB.prepare("SELECT * FROM ping_data ORDER BY timestamp DESC LIMIT 10").all();
        console.log('数据库中的ping数据:', allData);
        res.json({status: 1, data: allData, count: allData.length});
    } catch(e) {
        console.error('查询失败:', e);
        res.json({status: 0, error: e.message});
    }
});
}