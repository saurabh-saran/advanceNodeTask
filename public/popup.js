// --- SIGNUP → SEND OTPS
document
  .getElementById("registerForm")
  ?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    const res = await fetch("/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const out = await res.json();
    alert(out.message);

    if (res.ok) {
      // Keep these identifiers in memory for verify/finalize steps
      localStorage.setItem("pendingEmail", data.email);
      localStorage.setItem("pendingMobile", data.mobile);
      document.getElementById("otpSection").style.display = "block";
    }
  });

// --- VERIFY EMAIL OTP
document
  .getElementById("verifyEmailBtn")
  ?.addEventListener("click", async () => {
    const email = localStorage.getItem("pendingEmail");
    const otp = document.getElementById("emailOtp").value.trim();

    const res = await fetch("/verify/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp }),
    });
    const out = await res.json();
    alert(out.message);

    emailInput.value = "";
  });

// --- VERIFY MOBILE OTP
document
  .getElementById("verifyMobileBtn")
  ?.addEventListener("click", async () => {
    const email = localStorage.getItem("pendingEmail");
    const mobile = localStorage.getItem("pendingMobile");
    const otp = document.getElementById("mobileOtp").value.trim();

    const res = await fetch("/verify/mobile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, mobile, otp }),
    });
    const out = await res.json();
    alert(out.message);
  });

// --- FINALIZE REGISTRATION
document.getElementById("finalizeBtn")?.addEventListener("click", async () => {
  const email = localStorage.getItem("pendingEmail");
  const res = await fetch("/register/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const out = await res.json();
  alert(out.message);
});

// --- LOGIN FLOW (unchanged, but redirect to live.html + store user)
document.getElementById("loginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  const res = await fetch("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  alert(result.message);

  if (res.ok && result.user) {
    localStorage.setItem("user", JSON.stringify(result.user));
    window.location.href = "live.html";
  }
});
