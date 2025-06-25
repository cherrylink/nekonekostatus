"use strict"
module.exports=(DB)=>{
// 创建服务器监测配置表
DB.prepare(`CREATE TABLE IF NOT EXISTS server_ping_config (
    server_id TEXT,
    target_id INTEGER,
    enabled INTEGER DEFAULT 1,
    interval_seconds INTEGER DEFAULT 30,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (server_id, target_id)
)`).run();

const server_ping_config={
    // 设置服务器监测配置
    set(server_id, target_id, enabled = 1, interval_seconds = 30){
        return this._set.run(server_id, target_id, enabled, interval_seconds);
    },
    _set: DB.prepare("REPLACE INTO server_ping_config (server_id, target_id, enabled, interval_seconds) VALUES (?, ?, ?, ?)"),
    
    // 获取服务器的所有监测配置
    getByServer(server_id){
        return this._getByServer.all(server_id);
    },
    _getByServer: DB.prepare(`
        SELECT spc.*, pt.name, pt.address, pt.port, pt.type 
        FROM server_ping_config spc 
        JOIN ping_targets pt ON spc.target_id = pt.id 
        WHERE spc.server_id = ? 
        ORDER BY pt.created_at DESC
    `),
    
    // 获取特定配置
    get(server_id, target_id){
        return this._get.get(server_id, target_id);
    },
    _get: DB.prepare("SELECT * FROM server_ping_config WHERE server_id = ? AND target_id = ?"),
    
    // 删除配置
    del(server_id, target_id){
        return this._del.run(server_id, target_id);
    },
    _del: DB.prepare("DELETE FROM server_ping_config WHERE server_id = ? AND target_id = ?"),
    
    // 删除服务器的所有配置
    delByServer(server_id){
        return this._delByServer.run(server_id);
    },
    _delByServer: DB.prepare("DELETE FROM server_ping_config WHERE server_id = ?"),
    
    // 获取启用的配置
    getEnabled(server_id){
        return this._getEnabled.all(server_id);
    },
    _getEnabled: DB.prepare(`
        SELECT spc.*, pt.name, pt.address, pt.port, pt.type 
        FROM server_ping_config spc 
        JOIN ping_targets pt ON spc.target_id = pt.id 
        WHERE spc.server_id = ? AND spc.enabled = 1
        ORDER BY pt.created_at DESC
    `),
    
    // 根据目标ID获取使用该目标的配置
    getByTarget(target_id){
        return this._getByTarget.all(target_id);
    },
    _getByTarget: DB.prepare("SELECT * FROM server_ping_config WHERE target_id = ?"),
};

return {server_ping_config};
}