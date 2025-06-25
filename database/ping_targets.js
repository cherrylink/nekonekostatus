"use strict"
module.exports=(DB)=>{
// 创建监测目标表
DB.prepare(`CREATE TABLE IF NOT EXISTS ping_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    port INTEGER DEFAULT 80,
    type TEXT DEFAULT 'global',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run();

const ping_targets={
    // 插入新目标
    ins(name, address, port = 80, type = 'global'){
        return this._ins.run(name, address, port, type);
    },
    _ins: DB.prepare("INSERT INTO ping_targets (name, address, port, type) VALUES (?, ?, ?, ?)"),
    
    // 获取所有目标
    all(){
        return this._all.all();
    },
    _all: DB.prepare("SELECT * FROM ping_targets ORDER BY created_at DESC"),
    
    // 根据ID获取目标
    get(id){
        return this._get.get(id);
    },
    _get: DB.prepare("SELECT * FROM ping_targets WHERE id = ?"),
    
    // 获取全局目标
    getGlobal(){
        return this._getGlobal.all();
    },
    _getGlobal: DB.prepare("SELECT * FROM ping_targets WHERE type = 'global' ORDER BY created_at DESC"),
    
    // 更新目标
    upd(id, name, address, port, type){
        return this._upd.run(name, address, port, type, id);
    },
    _upd: DB.prepare("UPDATE ping_targets SET name = ?, address = ?, port = ?, type = ? WHERE id = ?"),
    
    // 删除目标
    del(id){
        return this._del.run(id);
    },
    _del: DB.prepare("DELETE FROM ping_targets WHERE id = ?"),
};

// 初始化默认监测目标
function initDefaults(){
    const existing = ping_targets.getGlobal();
    if(existing.length === 0){
        ping_targets.ins("Cloudflare", "1.1.1.1", 80, "global");
        ping_targets.ins("Google DNS", "8.8.8.8", 53, "global");
        ping_targets.ins("腾讯DNS", "119.29.29.29", 53, "global");
        console.log("初始化默认监测目标");
    }
}

initDefaults();

return {ping_targets};
}