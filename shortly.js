var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var session = require('express-session');
var bcrypt = require('bcrypt-nodejs');

// bcrypt.hash(myPlaintextPassword, saltRounds, function(err, hash) {
//   // Store hash in your password DB.
// });
// bcrypt.compare(myPlaintextPassword, hash, function(err, res) {
//     // res == true
// });

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));
app.use(session({secret: 'booga booga',cookie: {maxAge: 60000}}));

var checkUser = (req, res, next) => {
  if(req.session.id_user !== undefined){
    next();
  }else{
    res.redirect('/login');
  }
};

//add authentication mdlwr new stuff
app.get('/', checkUser,
function(req, res) {
  res.render('index');
});

app.get('/create', checkUser,
function(req, res) {
  res.render('index');
});

app.get('/login',
function(req, res) {
  req.session.destroy();
  res.render('login');
});

app.get('/signup',
function(req, res) {
  res.render('signup');
});

app.get('/links',
function(req, res) {
  db.knex
  .select()
  .from('urls')
  .where('id_user', req.session.id_user)
  .then((results) => {
    res.status(200).send(results);
  });
  // Links.reset().fetch().then(function(links) {
  //   res.status(200).send(links.models);
  // });
});

app.post('/links',
function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.sendStatus(404);
  }

  new Link({ url: uri, id_user: req.session.id_user }).fetch().then(function(found) {
    if (found) {
      res.status(200).send(found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.sendStatus(404);
        }

        Links.create({
          url: uri,
          title: title,
          baseUrl: req.headers.origin,
          id_user: req.session.id_user
        })
        .then(function(newLink) {
          res.status(200).send(newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/
app.post('/login',
function(req, res) {
  db.knex
  .select('id_user','username','password')
  .from('users')
  .where('username', req.body.username)
  .then((results) => {
    if(results.length === 0){
      res.render('signup');
    }else{
      bcrypt.compare(req.body.password, results[0].password, (err, isMatch) => {
        if(err){
          console.error(err);
          return;
        }
        if(isMatch){
          util.genSession(req, res, results[0].id_user);
        }else{
          res.render('login');
        }
      });
    }
  });
});

app.post('/signup',
function(req, res) {
  bcrypt.hash(req.body.password,bcrypt.genSaltSync(10),null,
  (err, hash) => {
    if(err){
      console.error(err);
      return;
    }
    Users.create({
      username: req.body.username,
      password: hash
    })
    .then((newUser) => {
      util.genSession(req, res, newUser.id);
    })
    .catch((err) => {
      res.redirect('/signup');
    })
  });
  //res.render('signup');
});


/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        linkId: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits') + 1);
        link.save().then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

module.exports = app;
