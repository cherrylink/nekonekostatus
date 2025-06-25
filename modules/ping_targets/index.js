"use strict";
module.exports=svr=>{
const {db,pr}=svr.locals;

// 获取所有监测目标
svr.get("/admin/ping-targets",(req,res)=>{
    res.render("admin/ping_targets",{
        targets: db.ping_targets.all()
    });
});

// 获取监测目标API
svr.get("/api/ping-targets",(req,res)=>{
    res.json(pr(1, db.ping_targets.all()));
});

// 创建新监测目标
svr.post("/admin/ping-targets/add",async(req,res)=>{
    var {name, address, port, type} = req.body;
    
    if(!name || !address){
        res.json(pr(0, '名称和地址不能为空'));
        return;
    }
    
    port = parseInt(port) || 80;
    type = type || 'global';
    
    try {
        const result = db.ping_targets.ins(name, address, port, type);
        res.json(pr(1, '添加成功', result.lastInsertRowid));
    } catch(e) {
        res.json(pr(0, '添加失败: ' + e.message));
    }
});

// 更新监测目标
svr.post("/admin/ping-targets/:id/edit",async(req,res)=>{
    var {id} = req.params;
    var {name, address, port, type} = req.body;
    
    if(!name || !address){
        res.json(pr(0, '名称和地址不能为空'));
        return;
    }
    
    port = parseInt(port) || 80;
    type = type || 'global';
    
    try {
        db.ping_targets.upd(id, name, address, port, type);
        res.json(pr(1, '更新成功'));
    } catch(e) {
        res.json(pr(0, '更新失败: ' + e.message));
    }
});

// 删除监测目标
svr.post("/admin/ping-targets/:id/del",async(req,res)=>{
    var {id} = req.params;
    
    try {
        // 检查是否有服务器在使用这个目标
        const configs = db.server_ping_config.getByTarget ? db.server_ping_config.getByTarget(id) : [];
        if(configs && configs.length > 0){
            res.json(pr(0, '有服务器正在使用此监测目标，无法删除'));
            return;
        }
        
        db.ping_targets.del(id);
        res.json(pr(1, '删除成功'));
    } catch(e) {
        res.json(pr(0, '删除失败: ' + e.message));
    }
});

// 获取全局监测目标
svr.get("/api/ping-targets/global",(req,res)=>{
    res.json(pr(1, db.ping_targets.getGlobal()));
});
}