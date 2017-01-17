var fs = require('fs'),
    xml2js = require('xml2js'),
    moment = require('moment');

var parser = new xml2js.Parser();
var eventdefs =
[
  { type: "doublematch", rex: /(.+) and (.+) won a doubles match agains (.+) and (.+)\./i, properties: ['winner_1', 'winner_2', 'loser_1', 'loser_2'] },
  { type: "singlematch", rex: /(.+) won a singles match agains (.+)\./i, properties: ['winner_1', 'loser_1'] },
  { type: "adjustment", rex: /Manual adjustment of player (.+): SW: (\d+)->(\d+), SL: (\d+)->(\d+), DW: (\d+)->(\d+), DL: (\d+)->(\d+), Points: (\d+)->(\d+)/i, properties: ['player', 'sw_from', 'sw_to', 'sl_from', 'sl_to', 'dw_from', 'dw_to', 'dl_from', 'dl_to', 'points_from', 'points_to'] },
  { type: "audittrail", rex: /(.+)'s score changed to (\d+) \((\d+) points was (\w+)\)\./i, properties: ['player', 'score', 'diff', 'operator'] }
]

var importEvents = function(callback) {
  fs.readFile(__dirname + '/sampledata/audittrail.xml', function(err, data) {
    parser.parseString(data, function (err, result) {
      var events = result.audittrail.item.map(
        function(entry) {
          var when = entry.when;
          var what = entry.what.toString();
          var whenfloat = parseFloat(when.toString().replace(',', '.'));
          var date = moment.unix(whenfloat);
          var eventdata = null;
          var type = "audittrail";
          for(var eventdefidx in eventdefs) {
            var eventdef = eventdefs[eventdefidx];
            var match = what.match(eventdef.rex);
            if (match) {
              eventdata = {};
              type = eventdef.type;
              for(var propid in eventdef.properties) {
                eventdata[eventdef.properties[propid]] = match[parseInt(propid) + 1];
              }
              break;
            }
          }
          if (! eventdata) eventdata = what;

          return {
            time: date.toDate(),
            type: type,
            data: eventdata
          }
        }
      );
      callback(events);
    });
  });
}

var increasePlayerProperty = function(playerTable, player, property, increase) 
{
  if (!playerTable[player]) playerTable[player] = { name: player, rank: 1200, doublesPlayed: 0, doublesWon: 0, doublesLost: 0, singlesPlayed: 0, singlesWon: 0, singlesLost: 0, events: []};
  playerTable[player][property] = (playerTable[player][property] || 0) + increase;
}

var addGameEvent = function(playerTable, player, score, diff, operator, timestamp)
{
  if (!playerTable[player]) playerTable[player] = { name: player, rank: 1200, doublesPlayed: 0, doublesWon: 0, doublesLost: 0, singlesPlayed: 0, singlesWon: 0, singlesLost: 0, events: []};
  
  var _diff = 0;
  if(operator == 'added')
    _diff =+ diff;
  else
    _diff =- diff;

  playerTable[player].events.push({timestamp: timestamp, score: +score, diff: _diff});
}

var byEventTime = function(a, b) 
{
  if (a.time < b.time) return -1;
  if (a.time > b.time) return 1;
  return 0;
};

var applyEvent = function(ev) 
{
  switch (ev.type) {
    case 'singlematch':
      increasePlayerProperty(players, ev.data.winner_1, 'singlesWon', 1);
      increasePlayerProperty(players, ev.data.loser_1, 'singlesLost', 1);

      var totalWinnerRank = players[ev.data.winner_1].rank;
      var totalLoserRank = players[ev.data.loser_1].rank;
      var scorePerPlayer = 10;
      if (totalWinnerRank > totalLoserRank) {
        scorePerPlayer = 5;
        if (totalWinnerRank > totalLoserRank + 100)
          scorePerPlayer = 0;
      } else {
        if (totalWinnerRank < totalLoserRank - 100)
        {
          scorePerPlayer = 20;
        } 
      }

      increasePlayerProperty(players, ev.data.winner_1, 'rank', scorePerPlayer);
      increasePlayerProperty(players, ev.data.loser_1, 'rank', -scorePerPlayer);

      games.push({
        timestamp: ev.time,
        type:'singlematch',
        winner_1: ev.data.winner_1, 
        loser_1: ev.data.loser_1,
        scorePerPlayer: scorePerPlayer
      });      
      break;
    case 'doublematch':
      increasePlayerProperty(players, ev.data.winner_1, 'doublesWon', 1);
      increasePlayerProperty(players, ev.data.winner_2, 'doublesWon', 1);
      increasePlayerProperty(players, ev.data.loser_1, 'doublesLost', 1);
      increasePlayerProperty(players, ev.data.loser_2, 'doublesLost', 1);

      var totalWinnerRank = players[ev.data.winner_1].rank + players[ev.data.winner_2].rank;
      var totalLoserRank = players[ev.data.loser_1].rank + players[ev.data.loser_2].rank;

      var scorePerPlayer = 5;
      if (totalWinnerRank > totalLoserRank) {
        scorePerPlayer = 3;
        if (totalWinnerRank > totalLoserRank + 100)
          scorePerPlayer = 0;
      } else {
        if (totalWinnerRank < totalLoserRank - 100)
        {
          scorePerPlayer = 10;
        } 
      }

      increasePlayerProperty(players, ev.data.winner_1, 'rank', scorePerPlayer);
      increasePlayerProperty(players, ev.data.winner_2, 'rank', scorePerPlayer);
      increasePlayerProperty(players, ev.data.loser_1, 'rank', -scorePerPlayer);
      increasePlayerProperty(players, ev.data.loser_2, 'rank', -scorePerPlayer);

      games.push({
        timestamp: ev.time,
        type:'doublematch',
        winner_1: ev.data.winner_1, 
        winner_2: ev.data.winner_2,
        loser_1: ev.data.loser_1,
        loser_2: ev.data.loser_2,
        scorePerPlayer: scorePerPlayer
      });

      break;
    case 'adjustment':
      increasePlayerProperty(players, ev.data.player, 'doublesWon', ev.data.dw_to - players[ev.data.player].doublesWon);
      increasePlayerProperty(players, ev.data.player, 'doublesLost', ev.data.dl_to - players[ev.data.player].doublesLost);
      increasePlayerProperty(players, ev.data.player, 'singlesWon', ev.data.sw_to - players[ev.data.player].singlesWon);
      increasePlayerProperty(players, ev.data.player, 'singlesLost', ev.data.sl_to - players[ev.data.player].singlesLost);
      increasePlayerProperty(players, ev.data.player, 'rank', ev.data.points_to - players[ev.data.player].rank);
      break;

    case 'audittrail':
      //console.dir(ev.data);
      addGameEvent(players, ev.data.player, ev.data.score, ev.data.diff, ev.data.operator, ev.time);
      break;
  }
}

var players = {};
var games = [];

var calculateTable = function(events) {

 // console.dir(events);
  events
    .sort(byEventTime)
    .forEach(applyEvent);

  var playerTable = [];
  Object.keys(players).forEach(function(player) {
    players[player].gamesPlayed = players[player].singlesWon + players[player].singlesLost + players[player].doublesWon + players[player].doublesLost;
    playerTable.push(players[player]);
  });
  playerTable.sort(function(a, b) {
    if (a.gamesPlayed < 10 && b.gamesPlayed > 10) return 1;
    if (a.gamesPlayed > 10 && b.gamesPlayed < 10) return -1;
    if (a.rank < b.rank) return 1;
    if (a.rank > b.rank) return -1;

    return 0;
  });
  console.log("%j",{playerTable:playerTable,games:games});
}

importEvents(calculateTable);