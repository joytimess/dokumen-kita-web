<template>
  <div class="auth-bubbles" aria-hidden="true">
    <span class="auth-bubble auth-bubble-one"></span>
    <span class="auth-bubble auth-bubble-two"></span>
    <span class="auth-bubble auth-bubble-three"></span>
    <span class="auth-bubble auth-bubble-four"></span>
  </div>
</template>

<style scoped>
.auth-bubbles {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}
.auth-bubble {
  position: absolute;
  border-radius: 50%;
  filter: blur(70px);
  will-change: transform;
  background: radial-gradient(circle at 35% 35%, #cdefdd, #cdefdd70 40%, transparent 72%);
}
.auth-bubble-one {
  width: 460px;
  height: 460px;
  top: -150px;
  left: -160px;
  animation: auth-float-a 6s ease-in-out -2s infinite alternate;
}
.auth-bubble-two {
  width: 540px;
  height: 540px;
  bottom: -180px;
  right: -180px;
  animation: auth-float-b 9s ease-in-out -3s infinite alternate;
}
.auth-bubble-three {
  width: 340px;
  height: 340px;
  top: 35%;
  left: 50%;
  background: radial-gradient(circle at 35% 35%, #e3f6ec, transparent 72%);
  animation: auth-float-c 4s ease-in-out -2s infinite alternate;
}
.auth-bubble-four {
  width: 280px;
  height: 280px;
  bottom: 20%;
  left: -100px;
  opacity: 0.6;
  animation: auth-float-d 6s ease-in-out -2s infinite alternate;
}
@keyframes auth-float-a {
  from {
    transform: translate3d(0, 0, 0) scale(1);
  }
  to {
    transform: translate3d(90px, 130px, 0) scale(1.12);
  }
}
@keyframes auth-float-b {
  from {
    transform: translate3d(0, 0, 0) scale(1);
  }
  to {
    transform: translate3d(-100px, -130px, 0) scale(1.08);
  }
}
@keyframes auth-float-c {
  from {
    transform: translate3d(0, 0, 0) scale(0.95);
  }
  to {
    transform: translate3d(-120px, 90px, 0) scale(1.15);
  }
}
@keyframes auth-float-d {
  from {
    transform: translate3d(0, 0, 0) scale(1);
  }
  to {
    transform: translate3d(130px, -90px, 0) scale(1.1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .auth-bubble {
    animation: none;
    will-change: auto;
  }
}
</style>
