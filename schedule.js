function deleteFolderOld(channel) {
    var keepFolders = [];
    var dirs = fs.readdirSync('./videos/' + channel);
    var keepDay = process.env.VIDEO_KEEP_DAY;
    for (var i = 0; i < keepDay; i++) {
        var rmDate = dateFormater.addDays(new Date(), -i);
        var dateStr = dateFormater.format(rmDate, "YYYYMMDD");
        keepFolders.push(dateStr);
    }
    for (var i = 0; i < dirs.length; i++) {
        var dir = './videos/' + channel + "/" + dirs[i];
        var isKeepDir = keepFolders.filter((e) => { return e == dirs[i]; }).length > 0;
        if (!isKeepDir && fs.existsSync(dir)) {
            console.log(">>>remove dir: " + dir);
            fs.rmSync(dir, { force: true, recursive: true });
        }
    }
}

function getSchedules(scheduleName) {
    var data = '';
    if (scheduleName.length > 0) {
        currentDateJob = scheduleName;
    }
    else {
        var currentDate = new Date();
        currentDate = dateFormater.addDays(currentDate, 1);
        currentDateJob = dateFormater.format(currentDate, "YYYY-MM-DD");
    }
    console.log("run at: " + currentDate);
    console.log("for date: " + currentDateJob);
    schedules = [];
    var postData = JSON.stringify({
        model: { BroadcastName: currentDateJob }
    });

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
        // Set the encoding, so we don't get log to the console a bunch of gibberish binary data
        response.setEncoding('utf8');
        // As data starts streaming in, add each chunk to "data"
        response.on('data', (chunk) => {
            data += chunk;
        });
        // The whole response has been received. Print out the result.
        response.on('end', () => {
            // console.log(data);
            if(data.length == 0){
                return;
            }
            var arr = JSON.parse(data);
            if (arr.length > 0) {
                for (var i = 0; i < arr.length; i++) {
                    var sch = addSchedule(
                        arr[i].id,
                        arr[i].channel,
                        arr[i].date,
                        arr[i].fileName,
                        arr[i].streamPath,
                        arr[i].startDate,
                        arr[i].endDate);
                    deleteFolderOld(arr[i].channel);
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
    if (!startDateStr
        || startDateStr == ''
        || !endDateStr
        || endDateStr == ''
        || exist) {
        return null
    }
    var startDate = new Date(startDateStr);
    var endDate = new Date(endDateStr);
    startDate = addMinutes(startDate, 3);
    endDate = addMinutes(endDate, 3);
    //for testing

    var videoName = fileName;
    var timeMs = (endDate - startDate) / 1000;
    var res = {
        id,
        channel,
        videoName,
        schedule,
        date,
        added: false
    };
    var dir = './videos/' + channel + "/" + date;

    if (!fs.existsSync('./videos/')) {
        fs.mkdirSync('./videos/');
    }

    if (!fs.existsSync('./videos/' + channel)) {
        fs.mkdirSync('./videos/' + channel);
    }

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
    var fileId = channel + "_" + videoName + "_" + id;
    var rs = files.find(function (v) {
        return v == fileId;
    });
    if (rs) {
        return null;
    }
    console.log(fileId);

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

module.exports = { downloadBasic, getSchedules, deleteFolderOld, addSchedule };