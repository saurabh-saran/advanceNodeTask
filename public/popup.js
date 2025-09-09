// --- SIGNUP → SEND OTPS
function showPopup(message) {
  const popup = document.getElementById("popupMsg");
  popup.textContent = message;
  popup.style.display = "block";
  // setTimeout(() => {
  // popup.style.display = "none";
  // }, 4);
}

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
    console.log("otpMessage==== ", out?.mobileOtpKey);
    if (out?.mobileOtpKey) {
      showPopup(out?.mobileOtpKey);
    }
    if (res.ok) {
      // Keep these identifiers in memory for verify/finalize steps
      localStorage.setItem("pendingEmail", data.email);
      localStorage.setItem("pendingMobile", data.mobile);
      ocument.getElementById("registerForm").style.display = "none";
      document.getElementById("otpSection").style.display = "block";
    } else {
      //  window.location.href = "index.html";
      otpBtn.disabled = false;
      otpBtn.style.opacity = "1";
      otpBtn.style.cursor = "pointer";
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

    // emailInput.value = "";
    console.log("out============== ", out);
    if (out?.isLogin) {
      localStorage.setItem("user", JSON.stringify(out.user));

      window.location.href = "live.html";
    }
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
    // popup.style.display = "none";

    if (out?.isLogin) {
      localStorage.setItem("user", JSON.stringify(out.user));

      window.location.href = "live.html";
    }
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
