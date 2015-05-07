// Description:
//   Allows slack users to authenticate to the Google APIs using OAuth 2.0
//
// Dependencies:
//   underscore
//   passport
//   passport-google-oauth
//   express
//   node-uuid
//   googleapis
//
// Configuration:
//   HUBOT_GOOGLE_OAUTH_CLIENT_ID
//   HUBOT_GOOGLE_OAUTH_CLIENT_SECRET
//   HUBOT_GOOGLE_SITE_VERIFICATION
//   HUBOT_URL
//
// Commands:
//   hubot log out of google - Removes stored oauth tokens for the user
//
// Author:
//   dbecher

module.exports = function(robot) {
  var CLIENT_ID = process.env.HUBOT_GOOGLE_OAUTH_CLIENT_ID,
      CLIENT_SECRET = process.env.HUBOT_GOOGLE_OAUTH_CLIENT_SECRET,
      CALLBACK_URL= process.env.HUBOT_URL + "/google/auth/callback";
  var express = require('express');
  var passport = require('passport');
  var uuid = require('node-uuid');
  var _ = require('underscore');
  var GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
  var googleapis = require('googleapis'),
      OAuth2 = googleapis.auth.OAuth2;

  var scopes = ['https://www.googleapis.com/auth/userinfo.profile',
              'https://www.googleapis.com/auth/userinfo.email',
              'openid'];
  if(process.env.HUBOT_GOOGLE_SCOPES) {
    scopes = scopes.concat(process.env.HUBOT_GOOGLE_SCOPES.split(","));
  }

  var app = express();
  var auth_sessions = {};

  // use passport for getting access/refresh tokens
  app.configure(function() {
    app.use(passport.initialize());
    app.use(app.router);
  });
  passport.use(new GoogleStrategy({
      clientID: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      callbackURL: CALLBACK_URL,
      scope: scopes
    },
    function(accessToken, refreshToken, profile, done) {
      console.log(accessToken, refreshToken);
      profile.accessToken = accessToken;
      profile.refreshToken = refreshToken;
      return done(null, profile);
    }
  ));

  function get_user(id, done) {
    var tokens = robot.brain.get("google_tokens");
    if(!tokens) {
      tokens = robot.brain.set("google_tokens", {});
    }
    var u = tokens[id];
    if(!u) {
      tokens[id] = {};
      u = tokens[id];
    }
    done(null, u);
  };

  function create_oauth_client(access, refresh) {
    var oauth2Client =
      new OAuth2(CLIENT_ID, CLIENT_SECRET, CALLBACK_URL);
    oauth2Client.credentials = {
      access_token: access,
      refresh_token: refresh
    };
    return oauth2Client;
  }

  if(process.env.HUBOT_GOOGLE_SITE_VERIFICATION) {
    app.get('/' + process.env.HUBOT_GOOGLE_SITE_VERIFICATION + '.html', function(req, res) {
      res.send(200, 'google-site-verification: ' + process.env.HUBOT_GOOGLE_SITE_VERIFICATION + '.html');
    });
  }

  app.get('/google/auth',
    function(req, res, next) {
      var token = req.query.token;
      passport.authenticate('google', { session: false, state: token, accessType: 'offline', approvalPrompt: 'force' })(req, res, next);
    });

  app.get('/google/auth/callback',
    passport.authenticate('google', { session: false, accessType: 'offline', approvalPrompt: 'force' }),
    function(req, res) {
      var auth_session = auth_sessions[req.query.state];
      if(!req.query.state || !auth_session) return res.send(401, "NOT OK");
      get_user(auth_session.user_id, function(err, u) {
        u.google_access_token = req.user.accessToken;
        u.google_refresh_token = req.user.refreshToken;
        var hubot_user = robot.brain.userForName(auth_session.user_id);
        robot.emit('google-authenticated', hubot_user);
        if(auth_session.onComplete) auth_session.onComplete(undefined, create_oauth_client( u.google_access_token, u.google_refresh_token ));
        auth_sessions[req.query.state] = undefined;
        res.send('Thanks, you can close this window now.');
      });
    });

  robot.on('google:authenticate', function(msg, next) {
    var u = msg.message ? msg.message.user : msg;
    get_user(u.name, function(err, token_user) {
      if(!token_user.google_access_token) {
        if(!msg.message) return next("No token");
        var sid = uuid.v1();
        auth_sessions[sid] = { onComplete: next, user_id: u.name };
        var reply = "Hey, I need you to log in before I can do that: " + process.env.HUBOT_URL + "/google/auth?token=" + sid;
        robot.emit('slack.attachment', {channel: u.name, text: reply});
      }
      else {
        var client = create_oauth_client( token_user.google_access_token, token_user.google_refresh_token );
        client.refreshAccessToken(function(err, tokens) {
          next(err, client);
        });
      }
    });
  });

  robot.respond(/log out of google/i, function(msg) {
    get_user(msg.message.user.name, function(err, u) {
      u.google_access_token = null;
      u.google_refresh_token = null;
      msg.reply("OK");
    });
  });

  robot.router.use(app);
}