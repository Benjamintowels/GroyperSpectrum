# CORS fix for Daily Run from localhost

The API at `http://45.55.249.232:3000` currently only allows:

```js
app.use(cors({ origin: 'https://benjamintowels.github.io' }));
```

So requests from `http://localhost:8000` are blocked.

**Change it to allow both production and local dev:**

```js
app.use(cors({
  origin: [
    'https://benjamintowels.github.io',
    'http://localhost:8000',
    'http://localhost:3000',
    'http://127.0.0.1:8000',
    'http://127.0.0.1:3000'
  ]
}));
```

Redeploy/restart the server after changing this.
