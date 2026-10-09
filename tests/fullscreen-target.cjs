const {app,BrowserWindow}=require('electron');
app.whenReady().then(()=>{
  const w=new BrowserWindow({width:620,height:420,backgroundColor:'#f7f4eb',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  w.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<title>全屏检测测试</title><body style="margin:0;display:grid;place-items:center;height:100vh;color:#464a3d;font:20px sans-serif">全屏检测测试</body>'));
});
app.on('window-all-closed',()=>app.quit());
