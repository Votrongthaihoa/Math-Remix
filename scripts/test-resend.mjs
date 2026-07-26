import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;

if (!apiKey || apiKey === "re_xxxxxxxxx") {
  throw new Error("Hãy thay re_xxxxxxxxx bằng API key Resend thật trong file .env.local.");
}

const resend = new Resend(apiKey);
const { data, error } = await resend.emails.send({
  from: "REMIX Education <onboarding@resend.dev>",
  to: ["hoaqwepr0@outlook.com.vn"],
  subject: "Hello World",
  html: "<p>Congrats on sending your <strong>first email</strong>!</p>",
});

if (error) throw new Error(error.message);
console.log(`Email đã được Resend tiếp nhận. ID: ${data?.id ?? "unknown"}`);
