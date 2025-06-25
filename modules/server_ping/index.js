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
        let configYaml = `key: ${server.data.api.key}\nport: ${server.data.api.port}\ndebug: false\n`;
        
        if(configs.length > 0){
            configYaml += 'ping_targets:\n';
            for(let config of configs){
                configYaml += `  - id: ${config.target_id}\n`;
                configYaml += `    name: "${config.name}"\n`;
                configYaml += `    address: "${config.address}"\n`;
                configYaml += `    port: ${config.port}\n`;
                configYaml += `    interval: ${config.interval_seconds}\n`;
            }
        }
        
        // 通过SSH更新配置文件
        const updateConfigCmd = `echo '${configYaml}' > /etc/neko-status/config.yaml && systemctl restart nekonekostatus`;
        
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
    
    if(!sid || !data){
        res.json(pr(0, '参数错误'));
        return;
    }
    
    try {
        // data是数组，包含多个监测结果
        if(Array.isArray(data)){
            for(let pingResult of data){
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
    
    try {
        let data;
        if(target_id){
            data = db.ping_data.getByTarget(sid, target_id, parseInt(hours));
        } else {
            data = db.ping_data.getByServer(sid, parseInt(hours));
        }
        
        res.json(pr(1, data));
    } catch(e) {
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
}