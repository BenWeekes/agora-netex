var AgoraRTCNetEx = (function () {

    const RemoteStatusGood = 0;
    const RemoteStatusFair = 1;
    const RemoteStatusPoor = 2;
    const RemoteStatusCritical = 3;

    var _rtc_clients = [];
    var _rtc_num_clients = 0;
    var _rtm_appid = null;
    var _rtm_token = null;
    var _rtmChannel = null;
    var _rtmClient = null;

    var _monitorRemoteCallStatsInterval;
    var _remoteCallStatsMonitorFrequency;
    var _userStatsMap = {};
    var _clientStatsMap = {};
    var _monitorStart = Date.now();
    var _monitorEnd = Date.now();


    var _br_min;
    var _br_max;
    var _br_current;
    var _br_last_downgrade = Date.now();
    var _br_last_upgrade = Date.now();
    var _br_last_fair = Date.now();
    var _br_last_downgrade_status=-1;

    async function monitorRemoteCallStats() {
        _clientStatsMap = {
            RemoteSubCount: 0,
            RecvBitrate: 0,
            SendBitrate: 0,
            SumRxNR: 0,
            SumRxLoss: 0,
            AvgRxNR: 0,
            AvgRxLoss: 0,
            RemoteStatusDuration: 0,
            RemoteStatus: 0,
            RemoteStatusExtra: 0,
            StatsRunTime: 0,
            StatsScheduleTime: 0
        };

        _monitorStart = Date.now();
        _clientStatsMap.StatsScheduleTime = _monitorStart - _monitorEnd;

        for (var i = 0; i < _rtc_num_clients; i++) {
            var client = _rtc_clients[i];
            if (client._p2pChannel.connection) {
                for (var u = 0; u < client._users.length; u++) {
                    var uid = client._users[u].uid;
                    if (client._p2pChannel.connection.peerConnection && client.getRemoteVideoStats()[uid] && client._users[u].videoTrack && client._users[u].videoTrack._mediaStreamTrack) {
                        // check each remote user has last stats map
                        if (!_userStatsMap[uid]) {
                            _userStatsMap[uid] = {
                                uid: uid,
                                lastStatsRead: 0,
                                lastNack: 0,
                                nackRate: 0,
                                lossRate: 0,
                                packetChange: 0,
                                receiveResolutionWidth: 0,
                                receiveResolutionHeight: 0,
                                receiveBitrate: 0,
                            };
                        }

                        await client._p2pChannel.connection.peerConnection.getStats(client._users[u].videoTrack._mediaStreamTrack).then(async stats => {
                            await stats.forEach(report => {
                                if (report.type === "inbound-rtp" && report.kind === "video") {
                                    var now = Date.now();
                                    var nack = report["nackCount"];
                                    var packetsReceived = report["packetsReceived"];
                                    var nackChange = (nack - _userStatsMap[uid].lastNack);
                                    var packetChange = (packetsReceived - _userStatsMap[uid].lastPacketsRecvd);
                                    var resetStats = false;
                                    if (packetChange < 0) {
                                        resetStats = true;
                                    }
                                    var timeDiff = now - _userStatsMap[uid].lastStatsRead;
                                    var nackRate = 0;
                                    if (packetChange > 0 && nackChange > 0) {
                                        nackRate = Math.floor((nackChange / packetChange) * (timeDiff / 10));
                                    }
                                    _userStatsMap[uid].lastStatsRead = now;
                                    _userStatsMap[uid].lastNack = nack;
                                    _userStatsMap[uid].nackRate = nackRate;
                                    _userStatsMap[uid].lastPacketsRecvd = packetsReceived;
                                    _userStatsMap[uid].packetChange = packetChange;
                                }
                            })
                        });

                        const remoteTracksStats = { video: client.getRemoteVideoStats()[uid], audio: client.getRemoteAudioStats()[uid] };
                        if (remoteTracksStats.video.renderFrameRate) {
                            _userStatsMap[uid].renderFrameRate = Number(remoteTracksStats.video.renderFrameRate);
                        } else {
                            _userStatsMap[uid].renderFrameRate = 0;
                        }

                        if (remoteTracksStats.video.receivePacketsLost) {
                            _userStatsMap[uid].lossRate = Number(remoteTracksStats.video.receivePacketsLost);
                        } else {
                            _userStatsMap[uid].lossRate = 0;
                        }
                        _userStatsMap[uid].receiveResolutionWidth = Number(remoteTracksStats.video.receiveResolutionWidth).toFixed(0);
                        _userStatsMap[uid].receiveResolutionHeight = Number(remoteTracksStats.video.receiveResolutionHeight).toFixed(0);
                        _userStatsMap[uid].receiveBitrate = Number(remoteTracksStats.video.receiveBitrate / 1000).toFixed(0);
                        if (_userStatsMap[uid].packetChange > 0) {
                            _userStatsMap[uid].totalDuration = Number(remoteTracksStats.video.totalDuration).toFixed(0);
                        } else {
                            _userStatsMap[uid].totalDuration = -1;
                        }

                        if (_userStatsMap[uid].packetChange > 0 && _userStatsMap[uid].totalDuration > 1) // when people drop they remain for a while
                        {
                            if (_userStatsMap[uid].nackRate > 0 && !isNaN(_userStatsMap[uid].nackRate)) {
                                _clientStatsMap.SumRxNR = _clientStatsMap.SumRxNR + _userStatsMap[uid].nackRate;
                            }

                            if (_userStatsMap[uid].lossRate > 0 && !isNaN(_userStatsMap[uid].lossRate)) {
                                _clientStatsMap.SumRxLoss = _clientStatsMap.SumRxLoss + _userStatsMap[uid].lossRate;
                            }

                            _clientStatsMap.RemoteSubCount = _clientStatsMap.RemoteSubCount + 1;
                        }
                    }
                }
                // channel (client) level stats
                const clientStats = client.getRTCStats();
                _clientStatsMap.RecvBitrate = _clientStatsMap.RecvBitrate + clientStats.RecvBitrate;
                _clientStatsMap.SendBitrate = _clientStatsMap.SendBitrate + clientStats.SendBitrate;
            }
        }

        _clientStatsMap.AvgRxNR = _clientStatsMap.SumRxNR / _clientStatsMap.RemoteSubCount;
        _clientStatsMap.AvgRxLoss = _clientStatsMap.SumRxLoss / _clientStatsMap.RemoteSubCount;
        _monitorEnd = Date.now();
        _clientStatsMap.StatsRunTime = (_monitorEnd - _monitorStart);

        let remoteStatus = RemoteStatusGood;
        if (_clientStatsMap.AvgRxNR > 20) {
            remoteStatus = RemoteStatusCritical;
        } else if (_clientStatsMap.AvgRxNR > 10) {
            remoteStatus = RemoteStatusPoor;
        } else if (_clientStatsMap.AvgRxNR > 4) {
            remoteStatus = RemoteStatusFair;
        }

        //console.warn(" RemoteStatus ", remoteStatus, " AvgRxNR ", _clientStatsMap.AvgRxNR, " AvgRxLoss ", _clientStatsMap.AvgRxLoss, " RecvBitrate ", _clientStatsMap.RecvBitrate, "SendBitrate ", _clientStatsMap.SendBitrate);
        sendRTM(remoteStatus, _clientStatsMap.RecvBitrate);

        if (_monitorRemoteCallStatsInterval) {
            setTimeout(() => {
                monitorRemoteCallStats();
            }, _remoteCallStatsMonitorFrequency);
        }
    }
    
    
   function uplinkStatus(client, minBitrate, fps, width, height){ 
         for (var i = 0; i < _rtc_num_clients; i++) {
           var client = _rtc_clients[i];
           const outboundStats = client.getLocalVideoStats();
           const clientStats = client.getRTCStats();
           const outboundBitrate=outboundStats.sendBitrate; // bps
           const outboundFrameRate=outboundStats.sendFrameRate; // fps
           const outboundResolutionWidth=outboundStats.sendResolutionWidth; // width
           const outboundResolutionHeight=outboundStats.sendResolutionHeight; // height
           const outboundEstimatedBitrate=clientStats.OutgoingAvailableBandwidth; // kbps // fps or resolution is lower than expected
           if (outboundFrameRate < fps*0.9 || width!=outboundResolutionWidth || height!=outboundResolutionHeight) {
               if (outboundEstimatedBitrate*1000<minBitrate) {
                // chrome has very low estimated outbound bitrate - the network is bad
               console.log("uplink network poor");
               } else {
                // must be due to low compute resources
               console.log("compute low");
               }
           } else {
               console.log("all good");
           }
        }
    }
    
    // End Network Statistics

    async function initRTM() {
        _rtmClient = await AgoraRTM.createInstance(_rtm_appid, { logFilter: AgoraRTM.LOG_FILTER_OFF });
        _rtmClient.on('ConnectionStateChanged', (newState, reason) => {
        });

        _rtmClient.on('MessageFromPeer', ({ text }, senderId) => {
            receiveRTM(senderId, text);
        });

        _rtmClient.login({ token: _rtm_token, uid: "RTM_" + _rtc_clients[0]._uid }).then(() => {

            _rtmChannel = _rtmClient.createChannel(_rtc_clients[0]._channelName);
            _rtmChannel.join().then(() => {
                _rtmChannel.on('ChannelMessage', ({ text }, senderId) => {
                    receiveRTM(senderId, text);
                });
                console.log("RTM Logged In");
            }).catch(error => {
                console.warn('AgoraRTM client join failure', error);
            });
        }).catch(error => {
            console.warn('AgoraRTM client login failure', error);
        });
    }

    function sendRTM(status, bitrate) {
        var msg = 'REMB###' + status + "###" + bitrate;
        _rtmChannel.sendMessage({ text: msg }).then(() => {
        }).catch(error => {
            console.error('AgoraRTM  send failure');
        });
    }

    function sendRTMPeer(uid, br) {
        uid = "RTM_" + uid;
        var msg = 'REMB###' + uid + '###' + br;
        _rtmClient.sendMessageToPeer({ text: msg }, uid).then(() => {
        }).catch(error => {
            console.error('AgoraRTM  send failure');
        });
    }

    async function changeHighStream(bitrate) {

        bitrate = Math.round(bitrate);

        if (bitrate < _br_min) {
            bitrate = _br_min;
        }

        if (bitrate > _br_max) {
            bitrate = _br_max;
        }

        if (_br_current == bitrate) {
            return;
        }
        await client._p2pChannel.localTrackMap.get("videoTrack").track.setEncoderConfiguration({ bitrateMax: bitrate }).then(() => {
            _br_current = bitrate;
            console.log(" setEncoderConfiguration  br: ", _br_current);
        }).catch(error => {
            console.error(' setEncoderConfiguration error: ', error);
        });
    }

    function receiveRTM(senderId, text) {
        if (text.startsWith('REMB')) {
            var msplit = text.split("###");
            var status = parseInt(msplit[1]);
            var bitrate = parseInt(msplit[2]);

            // states: good/fair/poor/critical
            /*
            if good and nothing other than good in last X (2) seconds increase by %
            if fair hold - ignore 
            if poor drop by %
            if critical drop to larger %  but make sure below BR in poor message
            // more than one publisher?
            */
            //console.log("tim u d f ",(Date.now() - _br_last_upgrade),(Date.now() - _br_last_downgrade),(Date.now() - _br_last_fair ));

            if (status == RemoteStatusGood) {
                // 10% increase every 2 seconds while good 
                if ((Date.now() - _br_last_downgrade > 5000) && (Date.now() - _br_last_upgrade > 2000)) {
                    // if no downgrade for 10s or fair for 10s go faster
                    var proposed = _br_current * 1.05;
                    if (Date.now() - _br_last_downgrade > 12000 && Date.now() - _br_last_fair > 8000) {
                        proposed = _br_current * 1.2;
                    } else if (Date.now() - _br_last_downgrade > 8000 && Date.now() - _br_last_fair > 4000) {
                        proposed = _br_current * 1.1;
                    }
                    changeHighStream(proposed);
                    //console.log("setEncoderConfiguration good diff "+ (Date.now() - _br_last_downgrade > 5000));
                    _br_last_upgrade = Date.now();
                }
            } else if (status == RemoteStatusFair) {
                //ok do nothing just now
                _br_last_fair = Date.now();
            } else if (status == RemoteStatusPoor || status == RemoteStatusCritical) {
                var proposed = _br_current * 0.8;
                if (status == RemoteStatusCritical) {
                    proposed = _br_current * 0.6;
                    if (proposed > bitrate) {
                        proposed = bitrate;
                    }
                }
                if (Date.now() - _br_last_downgrade > 2000 ||  (status == RemoteStatusCritical && _br_last_downgrade_status==RemoteStatusPoor) ) {
                    _br_last_downgrade_status=status;
                    changeHighStream(proposed);
                    _br_last_downgrade = Date.now();
                }
            }
        }
    }

    return { // public interfaces
        // RTM tokens
        optimizeNetworkControl: function (client, rtm_appid, rtm_token, br_min, br_max) {
            _rtc_clients[0] = client;
            _rtc_num_clients = 1;
            _br_min = br_min;
            _br_max = br_max;
            _br_current = br_max;
            _monitorRemoteCallStatsInterval = true;
            _remoteCallStatsMonitorFrequency = 500;
            _rtm_appid = rtm_appid;
            _rtm_token = rtm_token;
            initRTM()
            setTimeout(() => {
                monitorRemoteCallStats();
            }, _remoteCallStatsMonitorFrequency);
        },
        RemoteStatusGood: RemoteStatusGood,
        RemoteStatusFair: RemoteStatusFair,
        RemoteStatusPoor: RemoteStatusPoor,
        RemoteStatusCritical: RemoteStatusCritical,
    };
})();

var AgoraRTCNetExEvents = (function () {
    var events = {};
    function on(eventName, fn) {
        events[eventName] = events[eventName] || [];
        events[eventName].push(fn);
    }

    function off(eventName, fn) {
        if (events[eventName]) {
            for (var i = 0; i < events[eventName].length; i++) {
                if (events[eventName][i] === fn) {
                    events[eventName].splice(i, 1);
                    break;
                }
            }
        }
    }

    function emit(eventName, data) {
        if (events[eventName]) {
            events[eventName].forEach(function (fn) {
                fn(data);
            });
        }
    }

    return {
        on: on,
        off: off,
        emit: emit
    };
})();
