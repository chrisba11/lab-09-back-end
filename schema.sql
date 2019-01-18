DROP TABLE IF EXISTS weathers;
DROP TABLE IF EXISTS yelps;
DROP TABLE IF EXISTS movies;
DROP TABLE IF EXISTS meetups;
DROP TABLE IF EXISTS trails;
DROP TABLE IF EXISTS locations;

CREATE TABLE locations(
  id SERIAL PRIMARY KEY,
  created_at BIGINT,
  search_query VARCHAR(255),
  formatted_query VARCHAR(255),
  latitude NUMERIC(8,6),
  longitude NUMERIC(9,6)
);

CREATE TABLE weathers(
  id SERIAL PRIMARY KEY,
  created_at BIGINT,
  forecast VARCHAR(255),
  time VARCHAR(255),
  location_id INTEGER NOT NULL,
  FOREIGN KEY (location_id) REFERENCES locations (id)
);

CREATE TABLE yelps(
  id SERIAL PRIMARY KEY,
  created_at BIGINT,
  name VARCHAR(255),
  rating VARCHAR(255),
  price VARCHAR(255),
  image_url VARCHAR(255),
  url VARCHAR(255),
  location_id INTEGER NOT NULL,
  FOREIGN KEY (location_id) REFERENCES locations (id)
);

CREATE TABLE movies(
  id SERIAL PRIMARY KEY,
  created_at BIGINT,
  title VARCHAR(255),
  released_on VARCHAR(255),
  total_votes NUMERIC(6,0),
  average_votes NUMERIC(3,1),
  popularity NUMERIC(6,3),
  image_url VARCHAR(255),
  overview TEXT,
  location_id INTEGER NOT NULL,
  FOREIGN KEY (location_id) REFERENCES locations (id)
);

CREATE TABLE meetups(
  id SERIAL PRIMARY KEY,
  created_at BIGINT,
  link VARCHAR(255),
  name VARCHAR(255),
  host VARCHAR(255),
  creation_date VARCHAR(255),
  location_id INTEGER NOT NULL,
  FOREIGN KEY (location_id) REFERENCES locations (id)
);

CREATE TABLE trails(
  id SERIAL PRIMARY KEY,
  created_at BIGINT,
  trail_url VARCHAR(255),
  name VARCHAR(255),
  location VARCHAR(255),
  length NUMERIC (3,1),
  condition_date VARCHAR(255),
  condition_time VARCHAR(255),
  conditions VARCHAR(255),
  stars NUMERIC(2,1),
  star_votes NUMERIC(4,0),
  summary TEXT,
  location_id INTEGER NOT NULL,
  FOREIGN KEY (location_id) REFERENCES locations (id)
);
