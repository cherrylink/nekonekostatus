"use strict";
module.exports = svr => {
    const {db, pr} = svr.locals;
    
    // 获取所有分组（包含服务器数量）
    svr.get("/admin/groups", (req, res) => {
        res.render("admin/groups", {
            groups: db.groups.getAllWithServerCount()
        });
    });
    
    // 获取分组列表（API）
    svr.get("/api/groups", (req, res) => {
        res.json(pr(1, db.groups.all()));
    });
    
    // 添加分组
    svr.post("/admin/groups/add", (req, res) => {
        const {name, description, sort_order} = req.body;
        
        if (!name || name.trim() === '') {
            res.json(pr(0, '分组名称不能为空'));
            return;
        }
        
        try {
            const result = db.groups.ins(name.trim(), description || '', parseInt(sort_order) || 0);
            res.json(pr(1, '添加成功', {id: result.lastInsertRowid}));
        } catch (e) {
            res.json(pr(0, '添加失败: ' + e.message));
        }
    });
    
    // 编辑分组
    svr.post("/admin/groups/:id/edit", (req, res) => {
        const {id} = req.params;
        const {name, description, sort_order} = req.body;
        
        if (!name || name.trim() === '') {
            res.json(pr(0, '分组名称不能为空'));
            return;
        }
        
        try {
            const result = db.groups.upd(parseInt(id), name.trim(), description || '', parseInt(sort_order) || 0);
            if (result === false) {
                res.json(pr(0, '不能修改默认分组'));
                return;
            }
            res.json(pr(1, '修改成功'));
        } catch (e) {
            res.json(pr(0, '修改失败: ' + e.message));
        }
    });
    
    // 删除分组
    svr.post("/admin/groups/:id/del", (req, res) => {
        const {id} = req.params;
        const groupId = parseInt(id);
        
        if (groupId === 0) {
            res.json(pr(0, '不能删除默认分组'));
            return;
        }
        
        try {
            const result = db.groups.del(groupId);
            if (result === false) {
                res.json(pr(0, '删除失败'));
                return;
            }
            res.json(pr(1, '删除成功，该分组下的服务器已移动到默认分组'));
        } catch (e) {
            res.json(pr(0, '删除失败: ' + e.message));
        }
    });
    
    // 更新分组排序
    svr.post("/admin/groups/sort", (req, res) => {
        const {groups} = req.body;
        
        try {
            groups.forEach((groupId, index) => {
                db.groups.upd_sort(parseInt(groupId), index);
            });
            res.json(pr(1, '排序更新成功'));
        } catch (e) {
            res.json(pr(0, '排序更新失败: ' + e.message));
        }
    });
    
    // 移动服务器到分组
    svr.post("/admin/servers/:sid/move-group", (req, res) => {
        const {sid} = req.params;
        const {group_id} = req.body;
        
        try {
            db.servers.upd_group(sid, parseInt(group_id) || 0);
            res.json(pr(1, '移动成功'));
        } catch (e) {
            res.json(pr(0, '移动失败: ' + e.message));
        }
    });
    
    // 获取分组详情
    svr.get("/admin/groups/:id", (req, res) => {
        const {id} = req.params;
        const group = db.groups.get(parseInt(id));
        
        if (!group) {
            res.status(404).render("404");
            return;
        }
        
        res.render("admin/groups/edit", {
            group,
            servers: db.servers.getByGroup(parseInt(id))
        });
    });
}