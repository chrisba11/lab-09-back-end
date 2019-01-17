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


app.use(cors());

//declaring the endpoints
app.get('/location', searchToLatLong);
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

//pull in location data from the google places API & creates a new location object
function searchToLatLong(request, response){
  const url= `https://maps.googleapis.com/maps/api/geocode/json?address=${request.query.data}&key=${process.env.GEOCODE_API_KEY}`;

  return superAgent.get(url)
    .then(apiResponse=>{
      let location = new Location(request.query.data, apiResponse);
      response.send(location);
    })
    //catch errors for bad requests
    .catch(error => handleError(error, response));
}


//pulls data from the darksky api and creates a new weather object for 8 days
function getWeather(request, response){
  const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${request.query.data.latitude},${request.query.data.longitude}`;

  return superAgent.get(url)
    .then(weatherResponse =>{
      const weatherSummaries = weatherResponse.body.daily.data.map(day => {
        return new Weather(day);
      });
      response.send(weatherSummaries);
    })
    .catch(error => handleError(error, response));
}


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
