import "dotenv/config";
import { app } from "./app.js";

const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  console.log(`tutorgo-backend listening on http://127.0.0.1:${port}`);
});
