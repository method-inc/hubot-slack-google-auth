## Hubot-Slack Google Auth

Allows Slack users to authenticate with Google APIs using OAuth 2.0. This script is not meant to be used directly (it only has 1 command, for destroying a user's credentials), but provides an easy interface for other scripts to get an oauth2 client to be used with other [Google APIs](https://github.com/google/google-api-nodejs-client/).

## Configuration

Create a new project in the [Google Developers Console](https://console.developers.google.com) and add a new web application client ID. The redirect URI for the application should be `<public web address of your hubot instance>/google/auth/callback` The following environment variables must be set:

- `HUBOT_GOOGLE_OAUTH_CLIENT_ID`: OAuth client ID
- `HUBOT_GOOGLE_OAUTH_CLIENT_SECRET`: OAuth client secret
- `HUBOT_GOOGLE_SITE_VERIFICATION`: When adding a push domain, Google requires you to verify you own the domain using Webmaster Tools. For convenience, you can set this env variable and the script will create the required HTML page that google checks.
- `HUBOT_URL`: Public URL where your hubot instance is running. Used for the OAuth redirect URI.
- `HUBOT_GOOGLE_SCOPES`: Comma-separated list of additional scopes (beyond the basic user info ones) needed when a user authenticates. For example, if using the calendar script you would need `https://www.googleapis.com/auth/calendar`.

## Usage

This script is meant to be used by other scripts that respond to user commands, and as such there is really no "log in to google" command. Rather, it works by prompting the user to log in when they issue the first command that requires authentication and storing the access token and refresh token in the hubot brain.

To use in a script, just emit the `google:authenticate` event with the user (or message) and a callback that takes an error and oauth client:

```js
robot.respond(/create(me )?( an)? event (.*)/i, function(msg) {
  robot.emit('google:authenticate', msg, function(err, oauth) {
    googleapis
    .calendar('v3')
    .events.quickAdd({ auth: oauth }, function(err, event) {
      // ...
    });
  });
});
```

The callback will be called immediately if the user is already authenticated, or after the user logs in if they aren't. It will also handle refreshing the access token if necessary.