"use strict"
module.exports = (DB) => {
    // 创建分组表
    DB.prepare("CREATE TABLE IF NOT EXISTS groups (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)").run();
    
    // 插入默认分组
    const defaultGroupExists = DB.prepare("SELECT COUNT(*) as count FROM groups WHERE id = 0").get();
    if (defaultGroupExists.count === 0) {
        DB.prepare("INSERT INTO groups (id, name, description, sort_order) VALUES (0, '默认分组', '未分组的服务器', 0)").run();
    }

    const groups = {
        // 插入新分组
        _ins: DB.prepare("INSERT INTO groups (name, description, sort_order) VALUES (?, ?, ?)"),
        ins(name, description = '', sort_order = 0) {
            return this._ins.run(name, description, sort_order);
        },

        // 更新分组
        _upd: DB.prepare("UPDATE groups SET name = ?, description = ?, sort_order = ? WHERE id = ?"),
        upd(id, name, description = '', sort_order = 0) {
            if (id === 0) return false; // 不允许修改默认分组的基本信息
            return this._upd.run(name, description, sort_order, id);
        },

        // 更新排序
        upd_sort(id, sort_order) {
            return DB.prepare("UPDATE groups SET sort_order = ? WHERE id = ?").run(sort_order, id);
        },

        // 获取单个分组
        _get: DB.prepare("SELECT * FROM groups WHERE id = ?"),
        get(id) {
            return this._get.get(id);
        },

        // 获取所有分组
        _all: DB.prepare("SELECT * FROM groups ORDER BY sort_order ASC, id ASC"),
        all() {
            return this._all.all();
        },

        // 删除分组
        del(id) {
            if (id === 0) return false; // 不允许删除默认分组
            
            // 将该分组下的服务器移动到默认分组
            DB.prepare("UPDATE servers SET group_id = 0 WHERE group_id = ?").run(id);
            
            // 删除分组
            return DB.prepare("DELETE FROM groups WHERE id = ?").run(id);
        },

        // 获取分组及其服务器数量
        getAllWithServerCount() {
            const query = `
                SELECT g.*, 
                       COALESCE(s.server_count, 0) as server_count
                FROM groups g
                LEFT JOIN (
                    SELECT group_id, COUNT(*) as server_count 
                    FROM servers 
                    GROUP BY group_id
                ) s ON g.id = s.group_id
                ORDER BY g.sort_order ASC, g.id ASC
            `;
            return DB.prepare(query).all();
        }
    };

    return { groups };
}