"use strict"
module.exports=(DB)=>{
// // // DB.prepare("DROP TABLE servers").run();
DB.prepare("CREATE TABLE IF NOT EXISTS servers (sid,name,data,top,status,group_id INTEGER DEFAULT 0,PRIMARY KEY(sid))").run();
// 为现有服务器添加group_id字段（如果不存在）
try {
    DB.prepare("ALTER TABLE servers ADD COLUMN group_id INTEGER DEFAULT 0").run();
} catch(e) {
    // 字段已存在，忽略错误
}
const servers={
    _ins:DB.prepare("INSERT INTO servers (sid,name,data,top,status,group_id) VALUES (?,?,?,?,?,?)"),
    ins(sid,name,data,top,status=1,group_id=0){this._ins.run(sid,name,JSON.stringify(data),top,status,group_id)},
    _upd:DB.prepare("UPDATE servers SET name=?,data=?,top=?,group_id=? WHERE sid=?"),
    upd(sid,name,data,top,group_id=0){
        this._upd.run(name,JSON.stringify(data),top,group_id,sid);
    },
    upd_status(sid,status){DB.prepare("UPDATE servers SET status=? WHERE sid=?").run(status,sid);},
    upd_data(sid,data){DB.prepare("UPDATE servers SET data=? WHERE sid=?").run(JSON.stringify(data),sid);},
    upd_top(sid,top){
        this._upd_top.run(top,sid);
    },_upd_top:DB.prepare("UPDATE servers set top=? WHERE sid=?"),
    _get:DB.prepare("SELECT * FROM servers WHERE sid=?"),
    get(sid){
        var server=this._get.get(sid);
        if(server)server.data=JSON.parse(server.data);
        return server;
    },
    del(sid){DB.prepare("DELETE FROM servers WHERE sid=?").run(sid);},
    _all:DB.prepare("SELECT * FROM servers ORDER BY group_id ASC, top DESC"),
    all(){
        var svrs=this._all.all();
        svrs.forEach(svr=>{svr.data=JSON.parse(svr.data);});
        return svrs;
    },
    // 根据分组获取服务器
    getByGroup(group_id){
        var svrs=DB.prepare("SELECT * FROM servers WHERE group_id=? ORDER BY top DESC").all(group_id);
        svrs.forEach(svr=>{svr.data=JSON.parse(svr.data);});
        return svrs;
    },
    // 更新服务器分组
    upd_group(sid,group_id){
        return DB.prepare("UPDATE servers SET group_id=? WHERE sid=?").run(group_id,sid);
    },
    // 获取分组化的服务器列表
    getAllGrouped(){
        const query = `
            SELECT s.*, g.name as group_name, g.description as group_description
            FROM servers s
            LEFT JOIN groups g ON s.group_id = g.id
            ORDER BY g.sort_order ASC, g.id ASC, s.top DESC
        `;
        var svrs = DB.prepare(query).all();
        svrs.forEach(svr=>{svr.data=JSON.parse(svr.data);});
        return svrs;
    },
};
return {servers};
}