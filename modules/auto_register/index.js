"use strict";
module.exports = svr => {
    const {db, pr, uuid} = svr.locals;
    
    // 自动注册API端点
    svr.post("/api/auto-register", (req, res) => {
        try {
            const {
                hostname,           // 主机名
                ip_address,         // IP地址
                system_info,        // 系统信息
                group_name,         // 分组名称（可选）
                server_name,        // 服务器名称（可选）
                port = 9999,        // agent端口
                machine_id          // 机器唯一标识
            } = req.body;
            
            // 验证必要参数
            if (!hostname || !ip_address || !machine_id) {
                return res.json(pr(0, '缺少必要参数'));
            }
            
            // 生成或使用现有的服务器ID
            let sid = machine_id;
            
            // 检查是否已经注册过
            const existingServer = db.servers.get(sid);
            if (existingServer) {
                // 更新现有服务器信息
                const updatedData = {
                    ssh: existingServer.data.ssh || {
                        host: ip_address,
                        port: 22,
                        username: 'root',
                        password: '',
                        privateKey: ''
                    },
                    api: {
                        mode: true,  // 默认使用主动模式
                        key: existingServer.data.api?.key || uuid.v4(),
                        port: port
                    },
                    device: existingServer.data.device || '',
                    system_info: system_info,
                    auto_registered: true,
                    last_register_time: new Date().toISOString()
                };
                
                db.servers.upd(sid, server_name || existingServer.name, updatedData, existingServer.top, existingServer.group_id);
                
                // 检查并添加默认ping监测配置（如果还没有配置）
                let configs = [];
                try {
                    const existingConfigs = db.server_ping_config ? db.server_ping_config.getEnabled(sid) : [];
                    
                    if (existingConfigs.length === 0) {
                        // 没有配置，添加默认监测目标
                        const globalTargets = db.ping_targets ? db.ping_targets.getGlobal() : [];
                        
                        if (globalTargets && globalTargets.length > 0) {
                            globalTargets.forEach(target => {
                                if (db.server_ping_config) {
                                    db.server_ping_config.set(sid, target.id, 1, 30); // 默认30秒间隔
                                }
                            });
                            console.log(`为更新服务器 ${server_name || existingServer.name} 自动配置了 ${globalTargets.length} 个监测目标`);
                        }
                        
                        // 重新获取配置
                        configs = db.server_ping_config ? db.server_ping_config.getEnabled(sid) : [];
                    } else {
                        configs = existingConfigs;
                    }
                } catch (e) {
                    console.log('处理ping配置失败:', e.message);
                }
                
                const response = {
                    sid: sid,
                    api_key: updatedData.api.key,
                    port: port,
                    status: 'updated',
                    message: '服务器信息已更新'
                };
                
                // 如果有ping配置，添加到响应中
                if (configs && configs.length > 0) {
                    response.ping_targets = configs;
                    response.message += `, 已配置${configs.length}个监测目标`;
                }
                
                res.json(pr(1, response));
                return;
            }
            
            // 处理分组
            let group_id = 0; // 默认分组
            if (group_name) {
                const groups = db.groups.all();
                const existingGroup = groups.find(g => g.name === group_name);
                if (existingGroup) {
                    group_id = existingGroup.id;
                } else {
                    // 自动创建新分组
                    const newGroup = db.groups.ins(group_name, '自动创建的分组', 999);
                    group_id = newGroup.lastInsertRowid;
                }
            }
            
            // 生成API密钥
            const api_key = uuid.v4();
            
            // 确定服务器名称
            const final_name = server_name || hostname || `Server-${sid.slice(-8)}`;
            
            // 创建服务器数据
            const serverData = {
                ssh: {
                    host: ip_address,
                    port: 22,
                    username: 'root',
                    password: '',
                    privateKey: ''
                },
                api: {
                    mode: true,  // 默认使用主动模式
                    key: api_key,
                    port: port
                },
                device: '',
                system_info: system_info,
                auto_registered: true,
                register_time: new Date().toISOString()
            };
            
            // 获取当前最大的top值
            const servers = db.servers.all();
            const maxTop = servers.length > 0 ? Math.max(...servers.map(s => s.top || 0)) : 0;
            
            // 插入新服务器
            db.servers.ins(sid, final_name, serverData, maxTop + 1, 1, group_id);
            
            // 添加默认ping监测配置
            try {
                // 获取所有全局监测目标
                const globalTargets = db.ping_targets ? db.ping_targets.getGlobal() : [];
                
                if (globalTargets && globalTargets.length > 0) {
                    // 为新服务器自动配置全局监测目标
                    globalTargets.forEach(target => {
                        if (db.server_ping_config) {
                            db.server_ping_config.set(sid, target.id, 1, 30); // 默认30秒间隔
                        }
                    });
                    console.log(`为新服务器 ${final_name} 自动配置了 ${globalTargets.length} 个监测目标:`, globalTargets.map(t => `${t.name}(${t.address}:${t.port})`).join(', '));
                }
            } catch (e) {
                console.log('自动配置ping监测失败:', e.message);
            }
            
            // 返回包含ping配置的响应
            const response = {
                sid: sid,
                name: final_name,
                api_key: api_key,
                port: port,
                group_id: group_id,
                status: 'registered',
                message: '服务器注册成功'
            };
            
            // 如果有ping配置，添加到响应中
            try {
                const configs = db.server_ping_config ? db.server_ping_config.getEnabled(sid) : [];
                if (configs && configs.length > 0) {
                    response.ping_targets = configs;
                    response.message += `, 已配置${configs.length}个监测目标`;
                }
            } catch (e) {
                console.log('获取ping配置失败:', e.message);
            }
            
            res.json(pr(1, response));
            
        } catch (error) {
            console.error('自动注册错误:', error);
            res.json(pr(0, '注册失败: ' + error.message));
        }
    });
    
    // 获取自动注册的服务器列表
    svr.get("/admin/auto-registered", (req, res) => {
        const servers = db.servers.all().filter(server => {
            try {
                return server.data && server.data.auto_registered;
            } catch (e) {
                return false;
            }
        });
        
        res.render("admin/auto_registered", {
            servers: servers,
            groups: db.groups.all()
        });
    });
    
    // 批准自动注册的服务器
    svr.post("/admin/auto-registered/:sid/approve", (req, res) => {
        const {sid} = req.params;
        const server = db.servers.get(sid);
        
        if (!server) {
            return res.json(pr(0, '服务器不存在'));
        }
        
        // 更新状态为正常
        db.servers.upd_status(sid, 1);
        
        res.json(pr(1, '服务器已批准'));
    });
    
    // 拒绝自动注册的服务器
    svr.post("/admin/auto-registered/:sid/reject", (req, res) => {
        const {sid} = req.params;
        
        // 删除服务器记录
        db.servers.del(sid);
        
        res.json(pr(1, '服务器已拒绝并删除'));
    });
}