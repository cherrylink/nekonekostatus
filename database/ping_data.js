"use strict"
module.exports=(DB)=>{
// 创建监测数据表
DB.prepare(`CREATE TABLE IF NOT EXISTS ping_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    ip_version INTEGER,
    packets_sent INTEGER,
    packets_received INTEGER,
    packet_loss REAL,
    rtt_min REAL,
    rtt_avg REAL,
    rtt_max REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run();

// 创建索引以提高查询性能
DB.prepare("CREATE INDEX IF NOT EXISTS idx_ping_data_server_target ON ping_data(server_id, target_id)").run();
DB.prepare("CREATE INDEX IF NOT EXISTS idx_ping_data_timestamp ON ping_data(timestamp)").run();

const ping_data={
    // 插入监测数据
    ins(server_id, target_id, ip_version, packets_sent, packets_received, packet_loss, rtt_min, rtt_avg, rtt_max){
        return this._ins.run(server_id, target_id, ip_version, packets_sent, packets_received, packet_loss, rtt_min, rtt_avg, rtt_max);
    },
    _ins: DB.prepare("INSERT INTO ping_data (server_id, target_id, ip_version, packets_sent, packets_received, packet_loss, rtt_min, rtt_avg, rtt_max) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"),
    
    // 获取服务器的监测数据
    getByServer(server_id, hours = 24, limit = 1000){
        return this._getByServer.all(server_id, hours, limit);
    },
    _getByServer: DB.prepare(`
        SELECT pd.*, pt.name, pt.address, pt.port 
        FROM ping_data pd 
        JOIN ping_targets pt ON pd.target_id = pt.id 
        WHERE pd.server_id = ? AND pd.timestamp > datetime('now', '-? hours')
        ORDER BY pd.timestamp DESC 
        LIMIT ?
    `),
    
    // 获取特定目标的数据
    getByTarget(server_id, target_id, hours = 24, limit = 1000){
        return this._getByTarget.all(server_id, target_id, hours, limit);
    },
    _getByTarget: DB.prepare(`
        SELECT * FROM ping_data 
        WHERE server_id = ? AND target_id = ? AND timestamp > datetime('now', '-? hours')
        ORDER BY timestamp DESC 
        LIMIT ?
    `),
    
    // 获取最新数据
    getLatest(server_id, target_id){
        return this._getLatest.get(server_id, target_id);
    },
    _getLatest: DB.prepare(`
        SELECT pd.*, pt.name, pt.address, pt.port 
        FROM ping_data pd 
        JOIN ping_targets pt ON pd.target_id = pt.id 
        WHERE pd.server_id = ? AND pd.target_id = ? 
        ORDER BY pd.timestamp DESC 
        LIMIT 1
    `),
    
    // 获取统计数据
    getStats(server_id, target_id, hours = 24){
        return this._getStats.get(server_id, target_id, hours);
    },
    _getStats: DB.prepare(`
        SELECT 
            COUNT(*) as total_records,
            AVG(packet_loss) as avg_packet_loss,
            AVG(rtt_avg) as avg_rtt,
            MIN(rtt_min) as min_rtt,
            MAX(rtt_max) as max_rtt,
            MAX(timestamp) as last_update
        FROM ping_data 
        WHERE server_id = ? AND target_id = ? AND timestamp > datetime('now', '-? hours')
    `),
    
    // 清理旧数据
    cleanup(days = 30){
        return this._cleanup.run(days);
    },
    _cleanup: DB.prepare("DELETE FROM ping_data WHERE timestamp < datetime('now', '-? days')"),
};

return {ping_data};
}