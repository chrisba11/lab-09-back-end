'use strict';

//required dependencies
const express = require('express');
const cors = require('cors');
const superAgent = require('superagent');
const pg = require('pg');

require('dotenv').config();

//instantiating our app
const app = express();

const PORT = process.env.PORT;

//databse setup instantiating our new client
const client = new pg.Client(process.env.DATABASE_URL);
client.connect();
client.on('err', err => console.log(err));

app.use(cors());

//declaring the endpoints
app.get('/location', getLocation);
app.get('/weather', getWeather);
app.get('/yelp', getYelp);
app.get('/movies', getMovies);
app.get('/meetups', getMeetups);


app.get('/trails', getTrails);

//start the server at the specified port
app.listen(PORT, () => console.log(`Listening on ${PORT}`));

//check for errors
function handleError(error, response){
  console.error(error);
  if(response) response.status(500).send('Sorry, something went wrong!');
}

//LOCATION FUNCTIONS ------------------------------------------------------------------------------------------------

//sending info from DB to front end, if not in DB sending from API
function getLocation(request, response){
  const locationHandler = {
    query: request.query.data,

    cacheHit: results => {
      console.log('Got LOCATION data from SQL');
      response.send(results.rows[0]);
    },

    cacheMiss: () => {
      Location.fetch(request.query.data)
        .then(data => response.send(data));
    },
  };
  Location.lookup(locationHandler);
}

//ping API for location info
Location.fetch = query => {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;

  return superAgent.get(url)
    .then(apiResults => {
      if(!apiResults.body.results.length) {
        throw 'No LOCATION results';
      } else {
        let location = new Location(query, apiResults);
        return location.save()
          .then(result => {
            location.id = result.rows[0].id
            return location;
          })
      }
    });
};

//create a new location object that has the specified properties for each value returned above.
function Location(query, apiResult) {
  this.search_query = query;
  this.formatted_query = apiResult.body.results[0].formatted_address;
  this.latitude = apiResult.body.results[0].geometry.location.lat;
  this.longitude = apiResult.body.results[0].geometry.location.lng;
}

//push location to DB
Location.prototype.save = function() {
  let SQL = `INSERT INTO locations (search_query, formatted_query, latitude, longitude)
    VALUES($1, $2, $3, $4) RETURNING id`;
  let values = Object.values(this);
  return client.query(SQL, values);
};

//checking to see if info is in DB, if not ping API
Location.lookup = handler => {
  const SQL = `SELECT * FROM locations WHERE search_query=$1`;
  const values = [handler.query];
  return client.query(SQL, values)
    .then(results => {
      if(results.rowCount > 0) {
        handler.cacheHit(results);
      }
      else {
        handler.cacheMiss();
      }
    })
    .catch(console.error);
};

//GENERIC HELPER FUNCTIONS-----------------------------------------------------------------------------

//generic lookup used for all other than location
function lookup(handler, table) {
  const SQL = `SELECT * FROM ${table} WHERE location_id=$1;`;
  const values = [];
  values.push(handler.location.id);
  client.query(SQL, [handler.location.id])
    .then(result => {
      if(result.rowCount > 0) {
        handler.cacheHit(result);
      } else {
        handler.cacheMiss();
      }
    })
    .catch(error => handleError(error));
}

function deleteByLocationId(table, cityId) {
  const SQL = `DELETE from ${table} WHERE location_id=${cityId};`;
  return client.query(SQL);
}

const timeouts = {
  weather: 15 * 1000,
  yelp: 24 * 60 * 60 * 1000,
  movies: 7 * 24 * 60 * 60 * 1000,
  meetups: 6 * 60 * 60 * 1000,
  trails: 3 * 60 * 60 * 1000,
}

//WEATHER FUNCTIONS ------------------------------------------------------------------------------------------------

//sending info from DB to front end, if not in DB sending from API
function getWeather(request, response) {
  const handler = {
    location: request.query.data,
    cacheHit: function(result) {
      let ageOfResults = (Date.now() - result.rows[0].created_at);
      if(ageOfResults > timeouts.weather) {
        deleteByLocationId('weathers', this.location.id);
        this.cacheMiss();
      } else {
        response.send(result.rows);
      }
    },
    cacheMiss: function() {
      Weather.fetch(request.query.data)
        .then(results => response.send(results))
        .catch(console.error);
    },
  };
  lookup(handler, 'weathers');
}

//ping API for weather info
Weather.fetch = function(location) {
  const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${location.latitude},${location.longitude}`;
  return superAgent.get(url)
    .then(result => {
      const weatherSummaries = result.body.daily.data.map(day => {
        const summary = new Weather(day);
        summary.save(location.id);
        return summary;
      });
      return weatherSummaries;
    });
};

//create a new Weather object with the forecast & date, correctly formatted.
function Weather(data) {
  this.created_at = Date.now();
  this.forecast = data.summary;
  this.time = new Date(data.time * 1000).toString().slice(0,15);
}

//push weather to DB
Weather.prototype.save = function(id) {
  const SQL = `INSERT INTO weathers (created_at, forecast, time, location_id) VALUES ($1, $2, $3, $4);`;
  const values = Object.values(this);
  values.push(id);
  client.query(SQL, values);
};

//YELP FUNCTIONS ------------------------------------------------------------------------------------------------

//sending info from DB to front end, if not in DB sending from API
function getYelp(request, response) {
  const handler = {
    location: request.query.data,
    cacheHit: function(result) {
      let ageOfResults = (Date.now() - result.row[0].created_at);
      if(ageOfResults > timeouts.yelp) {
        deleteByLocationId('yelps', this.location.id);
        this.cacheMiss();
      } else {
        response.send(result.rows);
      }
    },
    cacheMiss: function() {
      Yelp.fetch(request.query.data)
        .then(results => response.send(results))
        .catch(console.error);
    },
  };
  lookup(handler, 'yelps');
}

//ping API for yelp info
Yelp.fetch = function(location) {
  const url = `https://api.yelp.com/v3/businesses/search?latitude=${location.latitude}&longitude=${location.longitude}`;
  return superAgent.get(url)
    .set({'Authorization': 'Bearer '+ process.env.YELP_API_KEY})
    .then(result => {
      const yelpSummaries = result.body.businesses.map(business => {
        const summary = new Yelp(business);
        summary.save(location.id);
        return summary;
      });
      return yelpSummaries;
    });
};

//Create a new yelp object with the correct yelp data as specified above.
function Yelp(food) {
  this.created_at = Date.now();
  this.name = food.name;
  this.rating = food.rating;
  this.price = food.price;
  this.image_url = food.image_url;
  this.url = food.url;
}

//push yelp to DB
Yelp.prototype.save = function(id) {
  const SQL = `INSERT INTO yelps (created_at, name, rating, price, image_url, url, location_id) VALUES ($1, $2, $3, $4, $5, $6, $7);`;
  const values = Object.values(this);
  values.push(id);
  client.query(SQL, values);
}

//MOVIE FUNCTIONS ------------------------------------------------------------------------------------------------

//sending info from DB to front end, if not in DB sending from API
function getMovies(request, response) {
  const handler = {
    location: request.query.data,
    cacheHit: function(result) {
      let ageOfResults = (Date.now() - result.rows[0].created_at);
      if(ageOfResults > timeouts.movies) {
        deleteByLocationId('movies', this.location.id);
        this.cacheMiss();
      } else {
        response.send(result.rows);
      }
    },
    cacheMiss: function() {
      Movie.fetch(request.query.data)
        .then(results => response.send(results))
        .catch(console.error);
    },
  };
  lookup(handler, 'movies');
}

//ping API for movie info
Movie.fetch = function(location) {
  const city = location.formatted_query.split(',')[0];
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIE_API_KEY}&query=${city}`;
  return superAgent.get(url)
    .then(result => {
      const movieSummaries = result.body.results.map(movie => {
        const summary = new Movie(movie);
        summary.save(location.id);
        return summary;
      });
      return movieSummaries;
    });
};

//Create a new movie object with the specified data as requested above.
function Movie(film) {
  this.created_at = Date.now();
  this.title = film.title;
  this.released_on = film.release_date;
  this.total_votes = film.vote_count;
  this.average_votes = film.vote_average;
  this.popularity = film.popularity;
  this.image_url = `https://image.tmdb.org/t/p/w500/${film.poster_path}`;
  this.overview = film.overview;
}

//push movie to DB
Movie.prototype.save = function(id) {
  const SQL = `INSERT INTO movies (created_at, title, released_on, total_votes, average_votes, popularity, image_url, overview, location_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`;
  const values = Object.values(this);
  values.push(id);
  client.query(SQL, values);
}

//MEETUP FUNCTIONS ------------------------------------------------------------------------------------------------

function getMeetups(request, response){
  console.log('runs get meetups');
  const handler = {
    location: request.query.data,
    cacheHit: function(result) {
      let ageOfResults = (Date.now() - result.rows[0].created_at);
      if(ageOfResults > timeouts.meetups) {
        deleteByLocationId('meetups', this.location.id);
        this.cacheMiss();
      } else {
        response.send(result.rows);
      }
    },
    cacheMiss: function() {
      Meetup.fetch(request.query.data)
        .then(results => response.send(results))
        .catch(console.error);
    },
  };
  lookup(handler, 'meetups');
}

Meetup.fetch = function(location) {
  const url = `https://api.meetup.com/find/upcoming_events?key=${process.env.MEETUP_API}&sign=true&photo-host=public&lon=${location.longitude}&page=20&lat=${location.latitude}`;
  return superAgent.get(url)
    .then(result => {
      const meetupSummaries = result.body.events.map(meet => {
        const summary = new Meetup(meet);
        summary.save(location.id);
        return summary;
      });
      return meetupSummaries;
    });
};

function Meetup(meet) {
  this.created_at = Date.now();
  this.link = meet.link;
  this.name = meet.name;
  this.host = meet.group.name;
  this.creation_date = new Date(meet.created).toString().slice(0,15) === 'Invalid Date' ? 'No date provided.' : new Date(meet.created).toString().slice(0,15);
}

Meetup.prototype.save = function(id) {
  const SQL = `INSERT INTO meetups (created_at, link, name, host, creation_date, location_id) VALUES ($1, $2, $3, $4, $5, $6);`;
  const values = Object.values(this);
  values.push(id);
  client.query(SQL, values);
}

//HIKING FUNCTIONS ------------------------------------------------------------------------------------------------

//sending info from DB to front end, if not in DB sending from API
function getTrails(request, response) {
  const handler = {
    location: request.query.data,
    cacheHit: function (result) {
      let ageOfResults = (Date.now() - result.rows[0].created_at);
      if(ageOfResults > timeouts.trails) {
        deleteByLocationId('trails', this.location.id);
        this.cacheMiss();
      } else {
        response.send(result.rows);
      }
    },
    cacheMiss: function() {
      Trail.fetch(request.query.data)
        .then(results => response.send(results))
        .catch(console.error);
    },
  };
  lookup(handler, 'trails');
}

//ping API for trail info
Trail.fetch = function(location) {
  const url = `https://www.hikingproject.com/data/get-trails?lat=${location.latitude}&lon=${location.longitude}&maxDistance=25&key=${process.env.HIKING_API}`;
  return superAgent.get(url)
    .then(result => {
      const trailSummaries = result.body.trails.map(trail => {
        const summary = new Trail(trail);
        summary.save(location.id);
        return summary;
      });
      return trailSummaries;
    });
};

//create new trail object for each trail with the requested data
function Trail(data) {
  const regex = /.+?[?= ]/;
  this.created_at = Date.now();
  this.trail_url = data.url;
  this.name = data.name;
  this.location = data.location;
  this.length = data.length;
  this.condition_date = new Date(data.conditionDate).toString().slice(0,10);
  this.condition_time = new Date(data.conditionDate).toLocaleString().replace(regex, '');
  this.conditions = data.conditionDetails ? data.conditionDetails : 'No Data Provided';
  this.stars = data.stars;
  this.star_votes = data.starVotes;
  this.summary = data.summary;
}

//push movie to DB
Trail.prototype.save = function(id) {
  const SQL = `INSERT INTO trails (created_at, trail_url, name, location, length, condition_date, condition_time, conditions, stars, star_votes, summary, location_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);`;
  const values = Object.values(this);
  values.push(id);
  client.query(SQL, values);
}
