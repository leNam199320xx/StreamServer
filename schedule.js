const dateFormater = require('date-and-time');
const spawn = require('child_process').spawn;
const http = require('http');
const https = require('https');
const fs = require('fs');
const { join } = require('path');
const config = require('dotenv').config();
const schedule = require('node-schedule');
var files = [];
var schedules = [];
var pathSave = process.env.PATH_SAVE;
var diffTime = process.env.DIFF_TIME;
var maxRetry = process.env.MAX_RETRY;
var ip = process.env.IP;
function deleteFolderOld(channel, date, keepDay, directory) {
    var keepFolders = [];
    if (directory.length > 0) {
        pathSave = directory;
    }
    if (!fs.existsSync(join(pathSave, 'videos', channel))) {
        return;
    }
    var dirs = fs.readdirSync(join(pathSave, 'videos', channel));

    if (!keepDay) {
        keepDay = process.env.VIDEO_KEEP_DAY;
    }
    console.log(channel + " keep " + keepDay + " day");
    for (var i = 0; i < keepDay; i++) {
        var _date = dateFormater.parse(date, "YYYYMMDD");
        var rmDate = dateFormater.addDays(_date, -i);
        var dateStr = dateFormater.format(rmDate, "YYYYMMDD");
        keepFolders.push(dateStr);
    }
    for (var i = 0; i < dirs.length; i++) {
        var dir = join(pathSave, 'videos', channel, dirs[i]);
        var isKeepDir = keepFolders.filter((e) => { return e == dirs[i]; }).length > 0;
        if (!isKeepDir && fs.existsSync(dir)) {
            fs.rmSync(dir, { force: true, recursive: true });
        }
    }
}

function getSchedules(scheduleName) {
    var data = '';
    schedules = [];
    var currentDate = new Date();
    if (scheduleName) {
        currentDateJob = scheduleName;
    }
    else {
        currentDate = dateFormater.addDays(currentDate, 1);
        currentDateJob = dateFormater.format(currentDate, "YYYY-MM-DD");
    }
    console.log("run at: " + currentDate);
    console.log("for date: " + currentDateJob);
    var postData = JSON.stringify({ BroadcastName: currentDateJob, IpAddress: ip });

    console.log("post");
    console.log(postData);

    var options = {
        hostname: process.env.CMS_HOST,
        port: parseInt(process.env.CMS_PORT),
        path: '/api/BroadcastSchedule/GetBroadCastsForServer',
        method: 'POST',
        headers: {
            'accept': '*/*',
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
        },
    };
    var _http = http;
    if (process.env.CMS_USE_SSL == "1") {
        _http = https;
    }
    var request = _http.request(options, (response) => {
        console.log(response.statusCode, response.statusMessage);
        if(response.statusCode != 200){
            return;
        }
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
            data += chunk;
        });
        response.on('end', () => {
            // console.log(data);
            if (data.length == 0) {
                return;
            }
            var arr = JSON.parse(data);
            // console.log("length " + arr.length);
            var chns = [];
            if (arr.length > 0) {
                for (var i = 0; i < arr.length; i++) {
                    var sch = addSchedule(
                        arr[i].id,
                        arr[i].channel,
                        arr[i].date,
                        arr[i].fileName,
                        arr[i].streamPath,
                        arr[i].startDate,
                        arr[i].endDate,
                        arr[i].directory
                    );
                    schedules.push(arr[i].id);
                }

                for (var i = 0; i < arr.length; i++) {
                    var isValid = true;
                    for (var j = 0; j < chns.length; j++) {
                        if (chns[j] == arr[i].channel) {
                            isValid = false;
                            break;
                        }
                    }
                    if (isValid) {
                        deleteFolderOld(arr[i].channel, arr[i].date, arr[i].keepDay, arr[i].directory);
                        chns.push(arr[i].channel);
                    }
                }
            }
        });
    });

    request.on('error', (error) => {
        console.error("error");
        console.error(error);
    });

    request.write(postData);

    // End the request
    request.end();
}
function addSchedule(id, channel, date, fileName, streamUrl, startDateStr, endDateStr, directory) {
    //2019-01-01T00:00:00
    var exist = schedules.filter((e) => { return e == id; }).length > 0;
    //console.log(exist)
    if (!startDateStr
        || startDateStr == ''
        || !endDateStr
        || endDateStr == ''
        || exist) {
        return null
    }

    var startDate = new Date(startDateStr);
    var endDate = new Date(endDateStr);
    startDate = addMinutes(startDate, diffTime);
    endDate = addMinutes(endDate, diffTime);
    //expired
    if (endDate < new Date()) {
        return;
    }

    //start lated
    if (startDate < new Date()) {
        startDate = new Date();
    }
    //console.log("run: ", startDate);
    var videoName = fileName;
    var duration = (endDate - startDate) / 1000;
    var res = {
        id,
        channel,
        videoName,
        date,
        added: false
    }; 
    if (directory.length > 0) {
        pathSave = directory;
    }
    var dir = join(pathSave, 'videos', channel, date);

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    var fileId = channel + "_" + videoName + "_" + id;
    var rs = files.filter(function (v) {
        return v == fileId;
    });
    if (rs.length > 0) {
        return null;
    }
    files.push(fileId);
    const job = schedule.scheduleJob(fileId, {
        start: startDate,
        rule: '* * * * * *'
    }, function () {
        try {
            download({ dir, videoName, streamUrl, duration });
        }
        catch { }
        schedule.cancelJob(job);
    }, function () {
        res.added = true;
        console.log("[" + channel + "] ADD [" + videoName + "] SUCCESS");
    });
    return res;
}

function addMinutes(date, minutes) {
    var d2 = new Date(date.getTime() + minutes * 60000);
    return d2;
}

function addSeconds(date, seconds) {
    var d2 = new Date(date.getTime() + seconds * 1000);
    return d2;
}

function toSeconds(hms) {
    var a = hms.split(':');
    var seconds = (+a[0]) * 60 * 60 + (+a[1]) * 60 + (+a[2]);
    return seconds + 1;
}

function finish(rs) {
    if (rs.isMultiFile == true) {
        console.log("--append txt: ", JSON.stringify(rs));
        fs.appendFileSync(rs.textPath, "file '" + rs.fileRootPath + "'\n")
        for (var i = 0; i < rs.numFile; i++) {
            var f = rs.fileRootPath.replace(".mp4", "_" + (i + 1) + ".mp4");
            if (fs.existsSync(f)) {
                fs.appendFileSync(rs.textPath, "file '" + f + "'\n");
            }
        }

        var finalFile = rs.fileRootPath.replace(".mp4", "_final.mp4");
        console.log("--merge files: ", finalFile);
        var args = [
            "-f", "concat",
            "-safe", "0",
            "-i", rs.textPath,
            "-c", "copy",
            finalFile
        ]
        var proc = spawn("ffmpeg", args);
        proc.stderr.setEncoding("utf8")
        proc.stdout.on('data', function (data) {
        });
        proc.stderr.on('data', function (data) {
        });
        proc.stderr.on('error', function (error) {
            console.log(error);
        });
        proc.on('close', function (data) {
            for (var i = 0; i < rs.numFile; i++) {
                var f = rs.fileRootPath.replace(".mp4", "_" + (i + 1) + ".mp4");
                if (fs.existsSync(f)) {
                    //console.log(f);
                    fs.rmSync(f);
                }
            }
            if (fs.existsSync(rs.fileRootPath))
                fs.rmSync(rs.fileRootPath);

            if (fs.existsSync(rs.textPath))
                fs.rmSync(rs.textPath);

            if (fs.existsSync(finalFile))
                fs.renameSync(finalFile, rs.fileRootPath);
            console.log("--close merge: ", data);
        });
    }
}

function download({ dir, videoName, streamUrl, duration }) {
    var num = 0;
    var obj = { dir, videoName, streamUrl, duration, num, onFinish: finish };
    console.log("--start download: ", JSON.stringify(obj));
    execFfmpeg(obj);
}

function execFfmpeg({ dir, videoName, streamUrl, duration, num, onFinish }) {
    var startTime = new Date();
    var cmd = 'ffmpeg';
    var seconds = 0;
    // var root = dir + "/" + videoName;
    // var newName = num == 0 ? root : root + "_" + num;
    var videoRootPath = join(dir, videoName + '.mp4');
    var videoPath = join(dir, num == 0 ? (videoName + '.mp4') : (videoName + "_" + num + '.mp4'));
    var textPath = join(dir, videoName + '.txt');
    var args = [
        '-y',
        '-i', streamUrl,
        '-t', duration,
        '-c', 'copy',
        '-bsf:a', 'aac_adtstoasc',
        videoPath
    ];

    console.log("--[" + videoRootPath + "] start now");
    var proc = spawn(cmd, args);
    proc.stdout.on('data', function (data) {
    });
    proc.stderr.setEncoding("utf8");
    proc.stderr.on('data', function (data) {
        //console.log("process record: ", data);
        if (data.indexOf("time=") > -1) {
            var i = data.indexOf("time=") + "time=".length;
            var t = data.substring(i, i + 8);
            seconds = toSeconds(t);
            //console.log(videoRootPath + " time: ", t);
        }
    });
    proc.stderr.on('error', function (error) {
        console.log("stderr error: ", error);
    });
    proc.on('close', function (data) {
        //console.log("close record: ", data);
        console.log("--[" + videoRootPath + "] seconds, duration: ", seconds, duration);
        if (seconds < duration) {
            var newDuration = duration - seconds;
            console.log("--[" + videoRootPath + "] restart remaining: ", newDuration);
            if (num < maxRetry) {
                num++;
                setTimeout(function () {
                    var newObj = {
                        startTime,
                        duration: newDuration,
                        dir,
                        videoName,
                        streamUrl,
                        num,
                        onFinish: finish
                    };
                    execFfmpeg(newObj);
                }, 3000);
            }
            else{
                if (typeof (onFinish) == 'function') {
                    onFinish({
                        isMultiFile: num > 0,
                        textPath: textPath,
                        fileRootPath: videoRootPath,
                        numFile: num
                    });
                }
            }
        }
        else {
            if (typeof (onFinish) == 'function') {
                onFinish({
                    isMultiFile: num > 0,
                    textPath: textPath,
                    fileRootPath: videoRootPath,
                    numFile: num
                });
            }
        }
    });
}

function downloadBasic(time, dir, streamPath, videoName) {
    var cmd = 'ffmpeg';
    var name = dir + "/" + videoName;

    var args = [
        '-y',
        '-i', streamPath,
        '-t', time,
        '-c', 'copy',
        '-bsf:a', 'aac_adtstoasc',
        name + '.mp4'
    ];


    var proc = spawn(cmd, args);
    var downloaderRunning = false;

    proc.stdout.on('data', function (data) {
        if (!downloaderRunning) {
            console.log("[" + name + "] running");
            downloaderRunning = true;
        }
    });

    proc.stderr.setEncoding("utf8")
    proc.stderr.on('data', function (data) {
        if (!downloaderRunning) {
            console.log("[" + name + "] running");
            downloaderRunning = true;
        }
    });

    proc.on('close', function () {
        console.log("[" + name + "] SUCCESS");
        schedules = schedules.filter(m => m.added == false && m.videoName != videoName);
    });
}

if (process.env.START_JOB_GET_SCHEDULE.length > 0) {
    const rule = new schedule.RecurrenceRule();
    rule.hour = parseInt(process.env.START_JOB_GET_SCHEDULE.split(":")[0]);
    rule.minute = parseInt(process.env.START_JOB_GET_SCHEDULE.split(":")[1]);
    rule.second = 0;
    const job = schedule.scheduleJob("getSchedules", rule, function () {
        schedules = [];
        getSchedules();
    }, function (e) {
        console.log("get schedules!");
        console.log(e);
    });
}

module.exports = { downloadBasic, getSchedules, deleteFolderOld, addSchedule, finish, download, execFfmpeg, addSeconds, addMinutes, toSeconds, schedules };
