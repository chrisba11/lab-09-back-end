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

//start the server at the specified port
app.listen(PORT, () => console.log(`Listening on ${PORT}`));

//check for errors
function handleError(error, response){
  console.error(error);
  if(response) response.status(500).send('Sorry, something went wrong!');
}

function getLocation(request, response){
  const locationHandler = {
    query: request.query.data,

    cacheHit: (results) => {
      console.log('Got LOCATION data from SQL');
      response.send(results.rows[0]);
    },

    cacheMiss: () => {
      Location.fetchLocation(request.query.data)
        .then(data => response.send(data));
    },
  };
  Location.lookupLocation(locationHandler);
}



//pull in location data from the google places API & creates a new location object
// function searchToLatLong(request, response){
//   const url= `https://maps.googleapis.com/maps/api/geocode/json?address=${request.query.data}&key=${process.env.GEOCODE_API_KEY}`;

//   return superAgent.get(url)
//     .then(apiResponse=>{
//       let location = new Location(request.query.data, apiResponse);
//       response.send(location);
//     })
//     //catch errors for bad requests
//     .catch(error => handleError(error, response));
// }


//pulls data from the darksky api and creates a new weather object for 8 days
// function getWeather(request, response){
//   const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${request.query.data.latitude},${request.query.data.longitude}`;

//   return superAgent.get(url)
//     .then(weatherResponse =>{
//       const weatherSummaries = weatherResponse.body.daily.data.map(day => {
//         return new Weather(day);
//       });
//       response.send(weatherSummaries);
//     })
//     .catch(error => handleError(error, response));
// }


//pull data from the yelp api & create a new Food object with the yelp data.
function getYelp(request, response){
  const url = `https://api.yelp.com/v3/businesses/search?latitude=${request.query.data.latitude}&longitude=${request.query.data.longitude}`;

  return superAgent.get(url)
    .set({'Authorization': 'Bearer '+ process.env.YELP_API_KEY})
    .then(yelpResponse => {
      const newYelp = yelpResponse.body.businesses.map(business => {
        return new Food(business);

      });
      response.send(newYelp);
    })
    .catch(error => handleError(error, response));
}

//pull data from the movie database and create a new movie object.
function getMovies(request, response){
  const city = request.query.data.formatted_query.split(',')[0];
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIE_API_KEY}&query=${city}`;

  return superAgent.get(url)
    .then(movieResponse => {
      const movieSummaries = movieResponse.body.results.map(movie =>{
        return new Movie(movie);
      });
      response.send(movieSummaries);
    })
    .catch(error => handleError(error, response));
}


//Constructor functions:
//create a new location object that has the specified properties for each value returned above.
function Location(query, apiResult) {
  this.search_query = query;
  this.formatted_query = apiResult.body.results[0].formatted_address;
  this.latitude = apiResult.body.results[0].geometry.location.lat;
  this.longitude = apiResult.body.results[0].geometry.location.lng;
}

//create a new Weather object with the forecast & date, correctly formatted.
function Weather(data){
  this.forecast = data.summary;
  this.time = new Date(data.time * 1000).toString().slice(0,15);
}

//Create a new Food object with the correct yelp data as specified above.
function Food(food) {
  this.name = food.name;
  this.rating = food.rating;
  this.price = food.price;
  this.image_url = food.image_url;
  this.url = food.url;
}

//Create a new movie object with the specified data as requested above.
function Movie(film){
  this.title = film.title;
  this.released_on = film.released_date;
  this.total_votes = film.vote_count;
  this.average_votes = film.vote_average;
  this.popularity = film.popularity;
  this.image_url = `https://image.tmdb.org/t/p/w500/${film.poster_path}`;
  this.overview = film.overview;
}

Location.fetchLocation = (query) => {
  const url= `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;

  return superAgent.get(url)
    .then( apiResults => {
      console.log('Got LOCATION results from API');
      console.log(apiResults.body);

      if( ! apiResults.body.results.length){ throw 'No LOCATION results'; }
      else {
        let location = new Location(query, apiResults);

        return location.save()
          .then( result =>{
            location.id = result.rows[0].id
            return location;
          })
      }
    });
};

Location.lookupLocation = (handler) => {
  const SQL = `SELECT * FROM locations WHERE search_query=$1`;
  const values = [handler.query];
  return client.query( SQL, values )
    .then( results => {
      if( results.rowCount > 0 ) {
        handler.cacheHit(results);
      }
      else {
        handler.cacheMiss();
      }
    })
    .catch( console.error );
};

Location.prototype.save = function () {
  let SQL = `INSERT INTO locations (search_query, formatted_query, latitude, longitude)
    VALUES($1, $2, $3, $4) RETURNING id`;

  let values = [this.search_query, this.formatted_query, this.latitude, this.longitude];
  return client.query(SQL, values);
};


function getWeather(request, response) {
  const handler = {
    location: request.query.data,
    cacheHit: function( result ) {
      response.send(result.rows);
    },
    cacheMiss: function() {
      Weather.fetch(request.query.data)
        .then(results => response.send(results))
        .catch(console.error);
    },
  };
  lookup(handler, 'weathers');
}

Weather.fetch = function( location ) {
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

Weather.prototype.save = function(id) {
  const SQL = `INSERT INTO weathers (forecast, time, location_id) VALUES ($1, $2, $3);`;
  const values = Object.values(this);
  values.push(id);
  client.query(SQL, values);
};

function lookup (handler, table){
  const SQL = `SELECT * FROM ${table} WHERE location_id=$1;`;
  client.query(SQL, [handler.location.id])
    .then(result => {
      if(result.rowCount > 0) {
        console.log('Got data from SQL');
        handler.cacheHit(result);
      } else {
        console.log('Got data from API');
        handler.cacheMiss();
      }
    })
    .catch(error => handleError(error));
};
