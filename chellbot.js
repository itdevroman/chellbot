/*
    ChellBot by itdevroman
    Twitch chat bot written in Node.JS
    https://github.com/itdevroman/chellbot
    v1.0.0
*/

// Requires
var irc = require("tmi.js");
var https = require('https');
var moment = require('moment');
var request = require('request');
var fs = require('fs');

// Messages templates
const messages = {
    cmdList: 'Команды: ',
    banMe: {
        fail: ' вам повезло, и вы не были забанены!',
        ban: ' вам повезло, и вы выиграли бан на ',
        off: 'Команда !banme отключена.',
        on: 'Команда !banme включена.'
    },
    time: {
        online: 'Стрим идёт уже: ',
        offline: 'Я вижу, что стрим не запущен.'
    },
    max: 'Максимальный онлайн на стриме, который мне удалось зафиксировать: ',
    maxClear: 'Максимальный онлайн сброшен и равен нулю.',
    vk: 'VK: '
};

// Bot main function
var chellbot = function(bot) {
    const host = bot.host;

    var options = {
        options: {
            debug: bot.debug
        },
        connection: {
            cluster: "aws",
            reconnect: true
        },
        identity: {
            username: bot.name,
            password: bot.oauth
        },
        channels: bot.channels
    };

    // IRC
    var client = new irc.client(options);

    var stamps = {
        lastAPI: null,
        max: 0,
        created_at: null,
        vk: null
    };

    // Bot command functions
    const biCommands = {
        secDecl: function(s) {
            const titles = [' секунду', ' секунды', ' секунд']
            const cases = [2, 0, 1, 1, 1, 2];  
            return titles[ (s%100>4 && s%100<20)? 2 : cases[(s%10<5)?s%10:5] ];  
        },
        banme: function(channel, username) {
            var willBan = Math.round(Math.random() * (200 - 1) + 1);
            if(willBan < 180) {
                var timeBan = Math.round(Math.random() * (600 - 10) + 10);
                client.timeout(channel, username, timeBan);
                client.say(channel, "@" + username + messages.banMe.ban + timeBan + this.secDecl(timeBan) + '.');
            }
            else {
                client.say(channel, "@" + username + messages.banMe.fail);
            }
        },
        banmeState: function(state, channel) {
            bot.allowedModules.banMe = state;
            if(state)
                client.say(channel, messages.banMe.on);
            else
                client.say(channel, messages.banMe.off);
        },
        time: function(channel) {
            if(stamps.created_at === null) {
                client.say(channel, messages.time.offline);
            } else {
                client.say(channel, messages.time.online + stamps.created_at);
            }
        },
        max: function(channel) {
            client.say(channel, messages.max + stamps.max);
        },
        clearMax: function(channel) {
            stamps.max = 0;
            client.say(channel, messages.maxClear);
        },
        hydra: function(channel, username, message) {
            if(message.indexOf('░░') != -1) {
                client.timeout(channel, username, 600);
            }
        }
    };

    client.connect();

    // Read all chat messages
    client.on("chat", function (channel, user, message, self) {

        // Hydra protection
        if(bot.allowedModules.hydra)
            biCommands.hydra(channel, user.username, message);

        var origMsg = message;
        message = message.toLowerCase();
        switch(message) {
            case '!banme':
                if(bot.allowedModules.banMe)
                    biCommands.banme(channel, user.username);
                break;
            case '!time':
                if(bot.allowedModules.time)
                    biCommands.time(channel);
                break;
            case '!up':
                if(bot.allowedModules.time)
                    biCommands.time(channel);
                break;
            case '!uptime':
                if(bot.allowedModules.time)
                    biCommands.time(channel);
                break;
            case '!max':
                if(bot.allowedModules.max)
                    biCommands.max(channel);
                break;
            case '!banoff':
                if(bot.allowedModules.banMe) {
                    if(user.mod)
                        biCommands.banmeState(false, channel);  
                }
                break;
            case '!banon':
                if(user.mod)
                    biCommands.banmeState(true, channel);  
                break;
            case '!clearmax':
                if(user.mod)
                    biCommands.clearMax(channel);  
                break;
        }

        // StrawPoll
        if(user.mod) {
            var spcmd = '!sp';
            if (origMsg.substr(0, spcmd.length).toUpperCase() == spcmd.toUpperCase()) {
                var poll = origMsg.replace(spcmd + ' ', '');
                poll = poll.split(';');

                if(poll.length > 2) {
                    var ans = [];

                    for (var i = 1; i < poll.length; i++) {
                        ans.push(poll[i]);
                    }

                    var newpoll = {
                        title: poll[0],
                        options: ans
                    };

                    request.post(
                        'https://strawpoll.me/api/v2/polls',
                        {
                            body: newpoll,
                            json: true,
                            followAllRedirects: true
                        },
                        function (error, response, body) {
                            if (!error && response.statusCode == 200) {
                                client.say(channel, 'http://strawpoll.me/' + body.id);
                            }
                        }
                    );
                }
            }
        }
    });

    setInterval(function() {
            https.get('https://api.twitch.tv/kraken/streams/' + host, function(res) { // запрос к твичу без клиент ид, небезопасная херня TODO
                var body = '';

                res.on('data', function(chunk){
                    body += chunk;
                });

                res.on('end', function(){
                    var streamInfo = JSON.parse(body);

                    if (streamInfo.stream !== null) {
                        if(streamInfo.stream.viewers > stamps.max)
                            stamps.max = streamInfo.stream.viewers;
                    }

                    if (streamInfo.stream === null) {
                        stamps.created_at = null;
                    } else {
                        var now = new Date();
                        var then = streamInfo.stream.created_at;
                        var ms = moment(now).diff(moment(then));
                        var d = moment.duration(ms);
                        var s = Math.floor(d.asHours()) + moment.utc(ms).format(" ч. mm мин.");
                        stamps.created_at = s;
                    }
                });
            }).on('error', function(e){
                  console.log("Got an API error: ", e);
            });
    }, 120000);

    if(bot.vk.enable) {
        var getGroup = function() {
            https.get('https://api.vk.com/method/wall.get?owner_id=' + bot.vk.name + '&count=1' , function(res) {
                var body = '';

                res.on('data', function(chunk){
                    body += chunk;
                });

                res.on('end', function(){
                    var groupInfo = JSON.parse(body);
                    
                    var postid = groupInfo.response[1].id;
                    var text = groupInfo.response[1].text.replace(/<(?:.|\n)*?>/gm, ''); // remove VK HTML tags

                    if(text.length > 256)
                       text = text.substring(0, 256) + '...';

                    if(stamps.vk == null)
                        stamps.vk = postid;
                    else {
                        if(parseInt(stamps.vk) < parseInt(postid)) {
                            client.say(bot.channels[0], messages.vk + text + ' ' + 'https://vk.com/' + bot.vk.name + '?w=wall' + bot.vk.id + '_' + postid);
                            stamps.vk = postid;
                        }
                    }
                });
            }).on('error', function(e){
                  console.log("Got an API error: ", e);
            });
        };

        setInterval(function() {
            getGroup(bot.vk.name);
        }, 60000);
    }
};

fs.readFile('./config.json', 'utf8', function (err, data) {
    if (err) {
        throw new Error("Couldn't find configuration");
        return false;
    }
    config = JSON.parse(data);
    chellbot(config);
});