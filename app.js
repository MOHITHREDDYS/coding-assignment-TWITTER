const express = require("express");
const app = express();
app.use(express.json());

const { open } = require("sqlite");

const sqlite3 = require("sqlite3");

const path = require("path");

const bcrypt = require("bcrypt");

const jwt = require("jsonwebtoken");

var format = require("date-fns/format");

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializingDatabaseAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is Running......");
    });
  } catch (e) {
    console.log(`DB Error : ${e.message}`);
  }
};

initializingDatabaseAndServer();

// API 1 -- Registering a New User
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const getUser = `
    SELECT * FROM user
    WHERE username = '${username}';`;
  const dbUser = await db.get(getUser);
  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const addUser = `
            INSERT INTO user (name, username, password, gender)
            VALUES ('${name}', '${username}', '${hashedPassword}', '${gender}');`;
      await db.run(addUser);
      response.send("User created successfully");
    }
  }
});

// API 2 -- Login of a User
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserFromDB = `
    SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(getUserFromDB);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatch = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatch === false) {
      response.status(400);
      response.send("Invalid password");
    } else {
      const payload = { username: username };
      const jwtToken = await jwt.sign(payload, "1678904567890$%ABDF&gf");
      response.send({ jwtToken });
    }
  }
});

// Authorizing the JWT Token
const authorizingAccessToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }

  if (authHeader === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "1678904567890$%ABDF&gf", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        const getUser = `SELECT * from user
      WHERE username = '${payload.username}';`;
        const dbUser = await db.get(getUser);
        request.username = payload.username;
        request.id = dbUser.user_id;
        next();
      }
    });
  }
};

// API 3 -- Latest Tweets of People Whom User Follows
app.get(
  "/user/tweets/feed/",
  authorizingAccessToken,
  async (request, response) => {
    const { username, id } = request;
    const getTweets = `
    SELECT username, tweet, date_time FROM user
    JOIN follower ON user.user_id = follower.following_user_id
    NATURAL JOIN tweet
    WHERE follower.follower_user_id = ${id}
    ORDER BY date_time DESC
    LIMIT 4;`;
    const tweets = await db.all(getTweets);
    response.send(
      tweets.map((obj) => ({
        username: obj.username,
        tweet: obj.tweet,
        dateTime: obj.date_time,
      }))
    );
  }
);

// API 4 -- List of names user following
app.get(
  "/user/following/",
  authorizingAccessToken,
  async (request, response) => {
    const { username, id } = request;
    const getFollowingUsers = `
    SELECT name FROM user
    JOIN follower ON following_user_id = user_id
    WHERE follower_user_id = ${id};`;
    const followingUsers = await db.all(getFollowingUsers);
    response.send(followingUsers);
  }
);

// API 5 -- List of names of user followers
app.get(
  "/user/followers/",
  authorizingAccessToken,
  async (request, response) => {
    const { username, id } = request;
    const getFollowerUsers = `
    SELECT name FROM user
    JOIN follower ON follower_user_id = user_id
    WHERE following_user_id = ${id};`;
    const followerUsers = await db.all(getFollowerUsers);
    response.send(followerUsers);
  }
);

// API 6 -- Tweets of the following user using tweetID
app.get(
  "/tweets/:tweetId/",
  authorizingAccessToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username, id } = request;
    const getTweet = `
    SELECT tweet,COUNT(DISTINCT like_id) AS likes, COUNT(DISTINCT reply_id) AS replies, tweet.date_time AS time FROM follower
    JOIN tweet ON following_user_id = tweet.user_id
    JOIN reply ON tweet.tweet_id = reply.tweet_id
    JOIN like ON like.tweet_id = tweet.tweet_id
    WHERE tweet.tweet_id = ${tweetId} AND
    follower.follower_user_id = ${id};`;
    const requiredTweet = await db.get(getTweet);
    if (requiredTweet.tweet === null) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send({
        tweet: requiredTweet.tweet,
        likes: requiredTweet.likes,
        replies: requiredTweet.replies,
        dateTime: requiredTweet.time,
      });
    }
  }
);

// API 7 -- Users who liked the Tweet
app.get(
  "/tweets/:tweetId/likes/",
  authorizingAccessToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username, id } = request;
    const getUsersLiked = `
    SELECT username FROM follower
    JOIN tweet ON following_user_id = tweet.user_id
    JOIN like ON like.tweet_id = tweet.tweet_id
    JOIN user ON like.user_id = user.user_id
    WHERE tweet.tweet_id = ${tweetId} AND
    follower.follower_user_id = ${id};`;
    const requiredUsers = await db.all(getUsersLiked);
    if (requiredUsers.length === 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      let result = [];
      requiredUsers.map((obj) => result.push(obj.username));
      response.send({
        likes: result,
      });
    }
  }
);

// API 8 -- Name and Replies of a User for a Tweet
app.get(
  "/tweets/:tweetId/replies/",
  authorizingAccessToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username, id } = request;
    const getTweet = `
    SELECT name, reply FROM follower
    JOIN tweet ON following_user_id = tweet.user_id
    JOIN reply ON reply.tweet_id = tweet.tweet_id
    JOIN user ON reply.user_id = user.user_id
    WHERE tweet.tweet_id = ${tweetId} AND
    follower.follower_user_id = ${id};`;
    const requiredTweet = await db.all(getTweet);
    if (requiredTweet.length === 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send({
        replies: requiredTweet,
      });
    }
  }
);

// API 9 -- Tweets of the User
app.get("/user/tweets/", authorizingAccessToken, async (request, response) => {
  const { username, id } = request;
  const getTweets = `
    SELECT tweet, COUNT(DISTINCT like_id) AS likes, COUNT(DISTINCT reply_id) AS replies, tweet.date_time AS dateTime FROM tweet
    JOIN reply ON reply.tweet_id = tweet.tweet_id
    JOIN like ON like.tweet_id = tweet.tweet_id
    WHERE tweet.user_id = ${id}
    GROUP BY tweet.tweet_id;`;
  const requiredTweet = await db.all(getTweets);
  response.send(requiredTweet);
});

// API 10 -- Posting a Tweet
app.post("/user/tweets/", authorizingAccessToken, async (request, response) => {
  const { username, id } = request;
  const { tweet } = request.body;
  const requireDate = format(new Date(), "yyyy-MM-dd HH:mm:ss");
  const postTweet = `
  INSERT INTO tweet (tweet, user_id, date_time)
  VALUES ('${tweet}', ${id}, '${requireDate}');`;
  await db.run(postTweet);
  response.send("Created a Tweet");
});

// API 11 -- Deleting a Tweet
app.delete(
  "/tweets/:tweetId/",
  authorizingAccessToken,
  async (request, response) => {
    const { username, id } = request;
    const { tweetId } = request.params;
    const getDBTweet = `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId};`;
    const dbTweet = await db.get(getDBTweet);
    if (dbTweet === undefined || dbTweet.user_id !== id) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweet = `
        DELETE FROM tweet
        WHERE tweet_id = ${tweetId};`;
      await db.run(deleteTweet);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
