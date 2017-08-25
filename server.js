var mysql = require('mysql');

// 创建数据库
var conn = mysql.createConnection({
    host : '127.0.0.1',
    user : 'root',
    password : '225129',
    port : '3306',
    database : 'b4',
});



var fs = require("fs");
var newMessage = {};
var newMsg = false;//无消息

// 调试功能
var DEBUG = true; //调试模式
// var DEBUG = false; //产品模式

// 命令状态
var CMD_STATE_WAIT_SEND = 1; //等待发送
var CMD_STATE_WAIT_REPO = 2; //等待回执
var CMD_STATE_REPO_SUCC = 3; //回执成功
var CMD_STATE_REPO_FAIL = 4; //回执错误
var CMD_STATE_REPO_RETRY_FAIL = 5; //重试失败
var CMD_STATE_ERROR = 6; //无效命令

var CMD_RETRY_NUM = 3; //重试次数

// 命令类型
var CMD_TYPE_BMS = 1; //BMS通讯命令
var CMD_TYPE_PAR = 2; //参数设置命令


function print(s){
    if(DEBUG == true){
        console.log(new Date().toLocaleString()+' :'+s);
    }
}

// 连接数据库
conn.connect(function(err){
    if(err)
    {
        print('database connection is error.');
    }
});

function writedata(file, data)
{
    fs.exists(file, function (exists)
    {
        if (exists) //存在
        {
            //写入
            fs.appendFile(file, data + "\r\n" + 'Time:' + new Date().toString() + "\r\n--------------------------------------\r\n"); //写入文件
            print("append content " + data + "\r\n");
        }
        else
        {
            //新建
            fs.writeFile(file, data + "\r\n", function (err)
            {
                if(err){
                    print(err);
                    return;
                }
                print("new file " + file + "\r\n" + 'Time:' + new Date().toString() + "\r\n--------------------------------------\r\n");
            }
            );
        }
    }
    );
    // fs.close()
}


// // 记录运行日志
// function logwrite(data){
//     writedata("log.txt",data);
// }

// // 记录错误
// function errwrite(data){
//     writedata("err.txt",data);
// }

// // 记录数据
function datawrite(data){
    writedata("data.txt",data);
}

// // 记录mysql数据
// function mysqlerrwrite(data){
//     writedata("mysql_err.txt",data);
// }

// // 记录设备状态
// function devlogwrite(data){
//     writedata("dev_log.txt",data);
// }

// 从数据中找到有效数据
function getpara(reg, str , num)
{
    if(!str){
        return '';
    }else{
        return (!reg.exec(str))?'':((!reg.exec(str)[num])?'':reg.exec(str)[num]);
    }
}


// 数据样例
// 心跳 "ld862991528408005"
// 回执 "5repo862991528408005recvusernameISadmin" or "5repo862991528408005recv13398977298"
// 上报 "dev:862991528408641;gps:0,117.3481528,032.8720612;data1:0103780CF90CF90CFA0CFA0CFA0CFA0CFA0CFA00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000427;data2:0103540000000000000000000000000000250B000000000CFA0CF70008000100030CF9010000000000641BF1;data3:010328013B013A013A0001000000000000000000000000013B013A000000000000000000000000000000004E58;data4:0103B40E420D48000309C40AF0000301240110000300C800E000030BB8000A00031388000A0003FFCE00000003FF38FF6A0003022601F40003025801F40003000000000E740E42000309600992000301280124000300C000C400030FA00BB8000313880FA00003000000140003FF4CFF560003021C02080003024402260003003200140DAC01C2012C00080001000800050005000500050E42001407D0001401F40004FFFD0000000007D003FF012404B0000000000000244E;data5:0103280DDE00000000000000000000000000000000000000010001000003FF000000030000000000000000789C;data6:0103860CF90CFA0CFA0CFA0CFA0CFA0CFC0CFA00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000CFC0CF90007000100030CFA0109000001090109000000000000250B00000000013B013B0000000000000000013B013B013B0000000000000000000000007BDC;data7:;data8:;data9:;data10:;"
// 启动 "rsdev:862991528408003;tip:47.93.33.171;tport:63101;key:WlhKN4JunVtzNXJxcqdIjd42Tboib30c;heart_t:5000;repo_t:180000;bms_t:5000;gps_t:30000;gps:1;bms:1;"
 

// 解析数据
function parse(client,data)
{
    var check_q,insert_q,update_q,delete_q;
    var res,para,paras;

    // 心跳
    if(/^ld\d+/.test(data)){
        print('心跳');
        var dev = getpara(/ld(\d{15})/,data,1);

        
        check_q = 'select * from `dev_cmd` where status=? and imei=? and num<=? order by create_time asc limit 1';//从最早的开始
        // 检查有没有未回执的命令
        res = conn.query(check_q,[CMD_STATE_WAIT_REPO,dev,CMD_RETRY_NUM],function(err,res){
            if(err){
                DEBUG && console.log(err);
                return;
            }
            if(res.length == 0){
                print('无未回执命令');
                // 检查是否有待响应指令
                res = conn.query(check_q,[CMD_STATE_WAIT_SEND,dev,CMD_RETRY_NUM],function(err,res){
                    if(err){
                        DEBUG && console.log(err);
                        return;
                    }
                    if(res.length == 0){
                        print('无待响应命令');
                    }else{
                        print('有待响应命令');
                        var type = res[0].type;
                        var send = res[0].send;
                        var id = res[0].id;
                        if(type == CMD_TYPE_BMS){
                            print('BMS通讯命令');
                            client.write(id+'BMS'+send);//BMS串口指令
                            print(id+' 发送串口指令 '+send+' To '+dev);
                        }else if(type == CMD_TYPE_PAR){
                            print('参数设置命令');
                            // 给前端发送指令
                            client.write(id+'PAR'+send);
                            print('发送参数设置命令'+send+'To'+dev);
                        }else{
                            print('无效命令');
                            check_q = 'update `dev_cmd` set status=?,update_time=timestamp(current_timestamp) where id=?';
                            res = conn.query(check_q,[CMD_STATE_ERROR,id],function(err,res){
                                if(err){
                                    DEBUG && console.log(err);
                                    return;
                                }
                                print('update dev_cmd status CMD_STATE_ERROR '+dev);
                            });
                        }
                        if(type == CMD_TYPE_BMS || type == CMD_TYPE_PAR){
                            print('更新发送状态');
                            check_q = 'update `dev_cmd` set status=?,update_time=timestamp(current_timestamp) where id=?';
                            res = conn.query(check_q,[CMD_STATE_WAIT_REPO,id],function(err,res){
                                if(err){
                                    DEBUG && console.log(err);
                                    return;
                                }
                                print('update dev_cmd status CMD_STATE_WAIT_REPO '+dev);
                            });
                        }
                    }
                });
            }else{
                print('有未回执命令');
                DEBUG && console.log(res);
                var type = res[0].type;
                var send = res[0].send;
                var id = res[0].id;
                var num = res[0].num;
                var update = res[0].update_time;
                var current = new Date().getTime();//当前时间
                update = new Date(update).getTime();//时间戳时间
                console.log(parseInt(current));
                console.log(parseInt(update));
                if(current > update + 20*1000) // 20秒重试一次
                {
                    print('未到重试时间');
                    return;
                } 
                print('未回执命令重试 当前第'+num+'次');
                if(num == CMD_RETRY_NUM)
                {
                    print(CMD_RETRY_NUM+'次通讯无回执 '+id+' To '+dev);
                    check_q = 'update `dev_cmd` set status=?,update_time=timestamp(current_timestamp) where id=?';
                    res = conn.query(check_q,[CMD_STATE_REPO_RETRY_FAIL,id],function(err,res){
                        if(err){
                            DEBUG && console.log(err);
                            return;
                        }
                        print('update dev_cmd status CMD_STATE_REPO_RETRY_FAIL '+dev);
                    });
                    return;
                }
                if(type == CMD_TYPE_BMS){
                    print('BMS通讯命令');
                    // 给前端发送指令
                    client.write(id+'BMS'+send);//BMS串口指令
                    print(id+' 发送串口指令 '+send+' To '+dev);
                }else if(type == CMD_TYPE_PAR){
                    print('参数设置命令');
                    // 给前端发送指令
                    client.write(id+'PAR'+send);
                    print(id+' 发送参数设置命令 '+send+' To '+dev);
                }else{
                    print('无效命令');
                    check_q = 'update `dev_cmd` set status=?,update_time=timestamp(current_timestamp) where id=?';
                    res = conn.query(check_q,[CMD_STATE_ERROR,id],function(err,res){
                        if(err){
                            DEBUG && console.log(err);
                            return;
                        }
                        print('update dev_cmd status CMD_STATE_ERROR '+dev);
                    });
                }
                if(type == CMD_TYPE_BMS || type == CMD_TYPE_PAR){
                    num += 1;
                    print('更新重试次数 '+num+'次');
                    check_q = 'update `dev_cmd` set num=?,update_time=timestamp(current_timestamp) where id=?';
                    res = conn.query(check_q,[num,id],function(err,res){
                        if(err){
                            DEBUG && console.log(err);
                            return;
                        }
                        print('update dev_cmd retry num '+dev);
                    });
                }
            }
        });
        res.on('end',function(result){console.log('Dev cmd Finished the results.')});
    }
    // 启动
    else if(/^rsdev:\w+/.test(data)){
        print('启动');
        // 解析数据
        var arr = data.split(';');
        var imei = getpara(/rsdev:(\d{15})/,arr[0],1);
        var tcpip = getpara(/^tip:(\d+.\d+.\d+.\d+)$/,arr[1],1);
        var tcpport = getpara(/^tport:(\d+)$/,arr[2],1);
        var product_key = getpara(/^key:(\w*)$/,arr[3],1);
        var heart_t = getpara(/^heart_t:(\d+)$/,arr[4],1);
        var repo_t = getpara(/^repo_t:(\d+)$/,arr[5],1);
        var bms_t = getpara(/^bms_t:(\d+)$/,arr[6],1);
        var gps_t = getpara(/^gps_t:(\d+)$/,arr[7],1);
        var gps_enable = getpara(/^gps:(\d+)$/,arr[8],1);
        var bms_enable = getpara(/^bms:(\d+)$/,arr[9],1);

        // 存入设备信息
        // 检查设备是否存在
        check_q = 'SELECT * FROM `dev_info` WHERE imei=?';
        // var drop_q1 = 'delete from `dev_info` where imei=?';
        insert_q = 'insert into `dev_info` (imei,tcpip,tcpport,product_key,heart_t,repo_t,bms_t,gps_t,gps_enable,bms_enable) values(?,?,?,?,?,?,?,?,?,?)';
        update_q = 'update `dev_info` set imei=?,tcpip=?,tcpport=?,product_key=?,heart_t=?,repo_t=?,bms_t=?,gps_t=?,gps_enable=?,bms_enable=?,update_time=timestamp(current_timestamp) where imei=?';
        
        // 检查设备信息是否存在
        res = conn.query(check_q,imei,function(err,res){
            if(err){
                console.log(err);
                return ;
            }
            if(res.length == 0){
                // 无数据
                var paras = [imei,tcpip,tcpport,product_key,heart_t,repo_t,bms_t,gps_t,gps_enable,bms_enable];
                var res = conn.query(insert_q,paras,function(err,res){
                    if(err){
                        DEBUG && console.log(err);
                        return;
                    }
                    print('insert dev_info '+imei);
                });
            }else{
                DEBUG && console.log(res[0]);
                // 有数据
                var paras = [imei,tcpip,tcpport,product_key,heart_t,repo_t,bms_t,gps_t,gps_enable,bms_enable,imei];
                var res = conn.query(update_q,paras,function(err,res){
                    if(err){
                        DEBUG && console.log(err);
                        return;
                    }
                    print('update dev_info '+imei);
                });
            }
        });
        res.on('end',function(result){console.log('Reset dev Finished the results.')});
    }
    // 上报
    else if(/^dev:\w+/.test(data)){
        print('上报');

        var arr = data.split(';');
        var imei = getpara(/dev:(\d{15})/, arr[0], 1);
        var gps = getpara(/gps:(\w*),([\w.]*),([\w.]*)/, arr[1], 1);
        var lng = getpara(/gps:(\w*),([\w.]*),([\w.]*)/, arr[1], 2) == "" ? "" : parseFloat(getpara(/gps:(\w*),([\w.]*),([\w.]*)/, arr[1],2)).toString();
        var lat = getpara(/gps:(\w*),([\w.]*),([\w.]*)/, arr[1], 3) == "" ? "" : parseFloat(getpara(/gps:(\w*),([\w.]*),([\w.]*)/, arr[1],3)).toString();
        lng = (lng == 'NaN') ? 'NaN'+getpara(/gps:(\w*),([\w.]*),([\w.]*)/, arr[1], 2) : lng; 
        lat = (lat == 'NaN') ? 'NaN'+getpara(/gps:(\w*),([\w.]*),([\w.]*)/, arr[1], 3) : lat; 
        var data1 = getpara(/data1:(\w*)/, arr[2], 1);
        var data2 = getpara(/data2:(\w*)/, arr[3], 1);
        var data3 = getpara(/data3:(\w*)/, arr[4], 1);
        var data4 = getpara(/data4:(\w*)/, arr[5], 1);
        var data5 = getpara(/data5:(\w*)/, arr[6], 1);
        var data6 = getpara(/data6:(\w*)/, arr[7], 1);
        var data7 = getpara(/data7:(\w*)/, arr[8], 1);
        var data8 = getpara(/data8:(\w*)/, arr[9], 1);
        var data9 = getpara(/data9:(\w*)/, arr[10], 1);
        var data10 = getpara(/data10:(\w*)/, arr[11], 1);

        insert_q = 'insert into `dev_data` (imei,gps,lng,lat,data1,data2,data3,data4,data5,data6,data7,data8,data9,data10) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
        paras = [imei,gps,lng,lat,data1,data2,data3,data4,data5,data6,data7,data8,data9,data10];
        res = conn.query(insert_q,paras,function(err,res){
            if(err){
                console.log(err);
                return;
            }
            print('insert into dev_data '+imei);
        });
        res.on('end',function(result){console.log('Dev data Finished the results.')});
    }
    // 回执
    else if(/\d+repo\w+/.test(data)){
        print('回执');
        var repo_id = getpara(/(\d+)repo(\d{15})recv([\w.]+)/, data, 1); 
        var repo_dev = getpara(/(\d+)repo(\d{15})recv([\w.]+)/, data, 2); 
        var repo_recv = getpara(/(\d+)repo(\d{15})recv([\w.]+)/, data, 3);

        writedata('repo.txt');
        // 检查回执的正确性 
        check_q = 'select * from `dev_cmd` where imei=? and id=?';
        res = conn.query(check_q,[repo_dev,repo_id],function(err,res){
                if(err){
                    console.log(err);
                    return;
                }
                if(res.length == 0)
                {
                    print('命令设备和id不符');
                }else{
                    print('命令设备和id相符');
                    if(/fail/.test(repo_recv)) //失败 status = 3   | 2 正常接收  |  1  发送等待接收
                    {
                        // 重新发送一次
                        // restatus = "4";
                                
                    }else{
                        print('命令回复完成');
                        update_q = 'update `dev_cmd` set recv=?,status=? where id=?';
                        conn.query(update_q,[repo_recv,CMD_STATE_REPO_SUCC,repo_id],function(err,res){
                            if(err){
                                console.log(err);
                                return;
                            }
                            print('update dev_cmd status '+repo_id);
                        });

                        // 更新设备参数
                        if(res[0].type == CMD_TYPE_PAR){
                            print('是参数设置命令,更新设备参数');
                            var column = getpara(/(\w+)is([\w.]+)/i,repo_recv,1);
                            var cols = ['tcpip','serial_num','car_id','owner','username','tcpport','product_key','heart_t','repo_t','bms_t','gps_t','gps_enable','bms_enable'];
                            if(cols.indexOf(column) == -1){
                                print('参数设置的列不存在');
                                update_q = 'update `dev_cmd` set recv=?,status=? where id=?';
                                conn.query(update_q,[repo_recv,CMD_STATE_REPO_FAIL,repo_id],function(err,res){
                                    if(err){
                                        console.log(err);
                                        return;
                                    }
                                    print('update dev_cmd status '+repo_id);
                                });
                                return;
                            }
                            var value = getpara(/(\w+)is([\w.]+)/i,repo_recv,2);
                            update_q = 'update `dev_info` set '+column+'=? where imei=?';
                            conn.query(update_q,[value,repo_dev],function(err,res){
                                if(err){
                                    console.log(err);
                                    return;
                                }
                                DEBUG && console.log(res);
                                print('response cmd update dev_info '+repo_dev+' id '+repo_id);
                            });
                        }

                    }
                }

            });
        res.on('end',function(result){console.log('Dev repo Finished the results.')});
        

        
    }
    else{
        print('异常');
    }
}


// 创建TCP服务器
var server = require('net').createServer();
// 端口
var port = 63101;
var sockets = [];
// 为server绑定事件
server.on('connection',function(socket){
    var addr = socket.remoteAddress;
    var port = socket.remotePort;
    var ip = addr+':'+port;
    print('TCP client '+ip);

    sockets.push(socket);
    print('Current client length is '+sockets.length+'.');

    socket.on('close',function(){
        print('TCP client '+ip+' is being closed.');
        var index = sockets.indexOf(socket);
        sockets.splice(index,1);
        print('Current client length is '+sockets.length);
    });

    socket.on('error',function(err){});

    socket.on('end',function(data){});

    socket.on('data',function(data){
        print('TCP rcv from client '+ip+' ');
        print(data);
        print(socket.remoteAddress);
        print(socket.remotePort);
        writedata("data.txt",data);
        parse(socket,data.toString());

    })
});
server.on('listening',function(){
    print('TCP server listen at port '+port+' OK!');
});
server.on('close',function(){
    print('TCP server is closed now.');
});
server.on('error',function(err){
    print(err);
    server.close();
    server.listen(port);
});
// 监听端口
server.listen(port);

// 整点报时
if(DEBUG){
    setInterval(function(){
        print('TCP server at port '+port+' is listening.');
    },60*1000);//1min
}

// 巡查命令

// 14:42:02.730 :TCP socket 127.0.0.1:60238 is being closed!error code 0.
// 14:42:02.309 :TCP rcv from socket 127.0.0.1:60238 

// 14:42:02.153 :TCP rcv from socket 127.0.0.1:60290 