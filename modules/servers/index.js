"use strict";
const {initServer,updateServer}=require("./func"),
    ssh=require("../../ssh");
module.exports=svr=>{
const {db,setting,pr,parseNumber,uuid}=svr.locals;
svr.post("/admin/servers/add",async(req,res)=>{
    var {sid,name,data,top,status,group_id}=req.body;
    if(!sid)sid=uuid.v1();
    db.servers.ins(sid,name,data,top,status,group_id);
    res.json(pr(1,sid));
});
svr.get("/admin/servers/add",(req,res)=>{
    res.render(`admin/servers/add`,{
        groups: db.groups.all()
    });
});
svr.post("/admin/servers/:sid/edit",async(req,res)=>{
    var {sid}=req.params,{name,data,top,status,group_id}=req.body;
    db.servers.upd(sid,name,data,top,group_id);
    if(status!=null)db.servers.upd_status(sid,status);
    res.json(pr(1,'修改成功'));
});
svr.post("/admin/servers/:sid/rename",async(req,res)=>{
    var {sid}=req.params,{name}=req.body;
    if(!name || name.trim() === ''){
        res.json(pr(0,'服务器名称不能为空'));
        return;
    }
    var server = db.servers.get(sid);
    if(!server){
        res.json(pr(0,'服务器不存在'));
        return;
    }
    db.servers.upd(sid, name.trim(), server.data, server.top);
    res.json(pr(1,'重命名成功'));
});
svr.post("/admin/servers/:sid/del",async(req,res)=>{
    var {sid}=req.params;
    db.servers.del(sid);
    res.json(pr(1,'删除成功'));
});
svr.post("/admin/servers/:sid/init",async(req,res)=>{
    var {sid}=req.params,
        server=db.servers.get(sid);    
    res.json(await initServer(server,db.setting.get("neko_status_url")));
});
svr.post("/admin/servers/:sid/update",async(req,res)=>{
    var {sid}=req.params,
        server=db.servers.get(sid);
    res.json(await updateServer(server,db.setting.get("neko_status_url")));
});
svr.get("/admin/servers",(req,res)=>{
    res.render("admin/servers",{
        servers:db.servers.all(),
        groups:db.groups.all()
    })
});
svr.post("/admin/servers/ord",(req,res)=>{
    var {servers}=req.body,ord=0;
    servers.reverse();
    for(var sid of servers)db.servers.upd_top(sid,++ord);
    res.json(pr(true,'更新成功'));
});
svr.get("/admin/servers/:sid",(req,res)=>{
    var {sid}=req.params,server=db.servers.get(sid);
    res.render(`admin/servers/edit`,{
        server,
        groups: db.groups.all()
    });
});
svr.ws("/admin/servers/:sid/ws-ssh/:data",(ws,req)=>{
    var {sid,data}=req.params,server=db.servers.get(sid);
    if(data)data=JSON.parse(data);
    ssh.createSocket(server.data.ssh,ws,data);
})

svr.get("/get-neko-status",async(req,res)=>{
    var path=__dirname+'/neko-status';
    // if(!fs.existsSync(path)){
    //     await fetch("文件url", {
    //         method: 'GET',
    //         headers: { 'Content-Type': 'application/octet-stream' },
    //     }).then(res=>res.buffer()).then(_=>{
    //         fs.writeFileSync(path,_,"binary");
    //     });
    // }
    res.sendFile(path);
})
}