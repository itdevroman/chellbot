/*
    ChellBot by itdevroman
    Twitch chat bot written in Node.JS
    https://github.com/itdevroman/chellbot
    v1.0.1
*/

// Requires
var irc = require("tmi.js");
var https = require('https');
var moment = require('moment');
var request = require('request');
var fs = require('fs');

// Bot main function
var chellbot = function(bot, messages) {
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

    // Chat command to function router
    const router = {
        banme: function(arg1, arg2, arg3, arg4) { // TODO: Can I write this args better or just don't use them? :thinking-face:
            if(bot.allowedModules.banMe)
                biCommands.banme(arg1, arg2.username);
        },
        uptime: function(arg1, arg2, arg3, arg4) {
            if(bot.allowedModules.time)
                biCommands.time(arg1);
        },
        up: function(arg1, arg2, arg3, arg4) {
            if(bot.allowedModules.time)
                biCommands.time(arg1); 
        },
        max: function(arg1, arg2, arg3, arg4) {
            if(bot.allowedModules.max)
                biCommands.max(arg1);
        },
        banoff: function(arg1, arg2, arg3, arg4) {
            if(bot.allowedModules.banMe) {
                if(arg2.mod)
                    biCommands.banmeState(false, channel);  
            }
        },
        banon: function(arg1, arg2, arg3, arg4) {
            if(arg2.mod)
                biCommands.banmeState(true, channel);  
        },
        clearmax: function(arg1, arg2, arg3, arg4) {
            if(arg2.mod)
                biCommands.clearMax(channel);  
        }
    };

    client.connect();

    // Read all chat messages
    client.on("chat", function (channel, user, message, self) {

        // Hydra protection
        if(bot.allowedModules.hydra)
            biCommands.hydra(channel, user.username, message);

        // Is command?
        const cmdExpr = new RegExp('^![A-z]*', 'g');
        const cmdArr = message.match(cmdExpr);

        if(cmdArr !== null && typeof(router[cmdArr[0].replace('!', '').toLowerCase()]) == 'function') { // Command
            router[cmdArr[0].replace('!', '').toLowerCase()](channel, user, message);
        }

        // StrawPoll
        if(user.mod) {
            var spcmd = '!sp';
            if (message.substr(0, spcmd.length).toUpperCase() == spcmd.toUpperCase()) {
                var poll = message.replace(spcmd + ' ', '');
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

// Load configuration and messages
fs.readFile('./config.json', 'utf8', function (err, config) {
    if (err) {
        throw new Error("Couldn't find configuration");
        return false;
    }

    fs.readFile('./messages.json', 'utf8', function (err, messages) {
        if (err) {
            throw new Error("Couldn't find messages");
            return false;
        }
        
        config = JSON.parse(config);
        messages = JSON.parse(messages);
        chellbot(config, messages);
    });
});