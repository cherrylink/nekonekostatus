var KB=1024,MB=KB*1024,GB=MB*1024,TB=GB*1024;
function strB(b){
    if(b<KB)return b.toFixed(2)+'B';
    if(b<MB)return (b/KB).toFixed(2)+'KB';
    if(b<GB)return (b/MB).toFixed(2)+'MB';
    if(b<TB)return (b/GB).toFixed(2)+'GB';
    else return (b/TB).toFixed(2)+'TB';
}
var Kbps=128,Mbps=Kbps*1000,Gbps=Mbps*1000,Tbps=Gbps*1000;
function strbps(b){
    if(b<Kbps)return b.toFixed(2)+'bps';
    if(b<Mbps)return (b/Kbps).toFixed(2)+'Kbps';
    if(b<Gbps)return (b/Mbps).toFixed(2)+'Mbps';
    if(b<Tbps)return (b/Gbps).toFixed(2)+'Gbps';
    else return (b/Tbps).toFixed(2)+'Tbps';
}
var mem_tooltips={},host_tooltips={};
setInterval(async()=>{
    var stats=await fetch("/stats/data").then(res=>res.json());
    for(var [sid,node] of Object.entries(stats))if(node.stat&&node.stat!=-1){
        var {cpu,mem,net,host}=node.stat;
        E(`${sid}_CPU`).innerText=(cpu.multi*100).toFixed(2)+'%';
        E(`${sid}_CPU_progress`).style.width=`${cpu.multi*100}%`;
        
        var {used,total}=mem.virtual,usage=used/total;
        E(`${sid}_MEM`).innerText=(usage*100).toFixed(2)+'%';
        E(`${sid}_MEM_progress`).style.width=`${usage*100}%`;
	    var content=`${strB(used)}/${strB(total)}`;
        if(mem_tooltips[sid])mem_tooltips[sid].$element[0].innerText=content;
	    else mem_tooltips[sid]=new mdui.Tooltip(`#${sid}_MEM_item`,{content});

        E(`${sid}_NET_IN`).innerText=strbps(net.delta.in);
        E(`${sid}_NET_OUT`).innerText=strbps(net.delta.out);
        E(`${sid}_NET_IN_TOTAL`).innerText=strB(net.total.in);
        E(`${sid}_NET_OUT_TOTAL`).innerText=strB(net.total.out);

        var content=
`系统: ${host.os}
平台: ${host.platform}
内核版本: ${host.kernelVersion}
内核架构: ${host.kernelArch}
启动: ${new Date(host.bootTime*1000).toLocaleString()}
在线: ${(host.uptime/86400).toFixed(2)}天`;
        if(!host_tooltips[sid])host_tooltips[sid]=new mdui.Tooltip(`#${sid}_host`,{});
        host_tooltips[sid].$element[0].innerText=content;
    }
    mdui.mutation();
},1000);

// 服务器名称编辑功能
var currentEditingSid = null;

function editServerName(sid, currentName) {
    // 防止同时编辑多个服务器名称
    if (currentEditingSid && currentEditingSid !== sid) {
        cancelEditServerName(currentEditingSid);
    }
    
    currentEditingSid = sid;
    var nameSpan = document.querySelector(`.server-name[data-sid="${sid}"]`);
    if (!nameSpan) return;
    
    // 创建输入框
    var input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.className = 'server-name-input';
    input.style.width = '100%';
    
    // 替换span为input
    nameSpan.parentNode.replaceChild(input, nameSpan);
    input.focus();
    input.select();
    
    // 绑定事件
    input.addEventListener('blur', function() {
        saveServerName(sid, input.value.trim(), currentName);
    });
    
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            input.blur(); // 触发保存
        } else if (e.key === 'Escape') {
            cancelEditServerName(sid, currentName);
        }
    });
    
    // 阻止点击事件冒泡
    input.addEventListener('click', function(e) {
        e.stopPropagation();
    });
}

function saveServerName(sid, newName, oldName) {
    if (!newName || newName === oldName) {
        cancelEditServerName(sid, oldName);
        return;
    }
    
    // 发送重命名请求
    fetch(`/admin/servers/${sid}/rename`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newName })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 1) {
            // 成功，更新显示
            updateServerNameDisplay(sid, newName);
            // 显示成功消息
            mdui.snackbar({
                message: '服务器名称已更新',
                position: 'right-top'
            });
        } else {
            // 失败，恢复原名称
            updateServerNameDisplay(sid, oldName);
            mdui.snackbar({
                message: data.data || '重命名失败',
                position: 'right-top'
            });
        }
    })
    .catch(error => {
        console.error('重命名失败:', error);
        updateServerNameDisplay(sid, oldName);
        mdui.snackbar({
            message: '网络错误，重命名失败',
            position: 'right-top'
        });
    });
    
    currentEditingSid = null;
}

function cancelEditServerName(sid, originalName) {
    updateServerNameDisplay(sid, originalName);
    currentEditingSid = null;
}

function updateServerNameDisplay(sid, name) {
    var input = document.querySelector(`input[data-sid="${sid}"], .server-name-input`);
    if (!input) return;
    
    // 创建新的span元素
    var span = document.createElement('span');
    span.className = 'server-name';
    span.setAttribute('data-sid', sid);
    span.setAttribute('onclick', `editServerName('${sid}', '${name.replace(/'/g, "\\'")}')`)
    span.textContent = name;
    
    // 替换input为span
    input.parentNode.replaceChild(span, input);
}
