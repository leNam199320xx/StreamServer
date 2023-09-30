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
function deleteFolderOld(channel, date, keepDay) {
    var keepFolders = [];
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
    var postData = JSON.stringify({ BroadcastName: currentDateJob });

    console.log("post");
    console.log(postData);

    var options = {
        hostname: process.env.CMS_HOST,
        port: parseInt(process.env.CMS_PORT),
        path: '/api/BroadcastSchedule/GetBroadCastsForJob',
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
                    var isValid = true;
                    for (var j = 0; j < chns.length; j++) {
                        if (chns[j] == arr[i].channel) {
                            isValid = false;
                            break;
                        }
                    }
                    if (isValid) {
                        deleteFolderOld(arr[i].channel, arr[i].date, arr[i].keepDay);
                        chns.push(arr[i].channel);
                    }
                    var sch = addSchedule(
                        arr[i].id,
                        arr[i].channel,
                        arr[i].date,
                        arr[i].fileName,
                        arr[i].streamPath,
                        arr[i].startDate,
                        arr[i].endDate);
                    schedules.push(arr[i].id);
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
function addSchedule(id, channel, date, fileName, streamPath, startDateStr, endDateStr) {
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
    //for testing

    //console.log("run: ", startDate);
    var videoName = fileName;
    var timeMs = (endDate - startDate) / 1000;
    var res = {
        id,
        channel,
        videoName,
        date,
        added: false
    };
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
        end: endDate,
        rule: '* * * * * *'
    }, function () {
        downloadBasic(timeMs, dir, streamPath, videoName);
        schedule.cancelJob(fileId);
    }, function () {
        res.added = true;
        console.log("[" + channel + "] add [" + videoName + "] to schedule successfully ");
    });
    return res;
}

function addMinutes(date, minutes) {
    date.setMinutes(date.getMinutes() + minutes);
    return date;
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
            console.log("dowwnload [" + name + "] running");
            downloaderRunning = true;
        }
    });

    proc.stderr.setEncoding("utf8")
    proc.stderr.on('data', function (data) {
        if (!downloaderRunning) {
            console.log("download [" + name + "] running");
            downloaderRunning = true;
        }
    });

    proc.on('close', function () {
        console.log("download [" + name + "] successfully");
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

module.exports = { downloadBasic, getSchedules, deleteFolderOld, addSchedule, schedules };
