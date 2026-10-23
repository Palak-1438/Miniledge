import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { requestOtpSchema, verifyOtpSchema } from './auth.schemas';
import * as service from './auth.service';

export const authRouter = Router();

authRouter.post(
  '/request-otp',
  validate(requestOtpSchema),
  asyncHandler(async (req, res) => {
    const { expiresInSeconds } = await service.requestOtp(req.body.phone);
    // The OTP itself is deliberately NOT part of the response.
    res.status(200).json({ message: 'OTP requested', expiresInSeconds });
  }),
);

authRouter.post(
  '/verify-otp',
  validate(verifyOtpSchema),
  asyncHandler(async (req, res) => {
    const result = await service.verifyOtp(req.body.phone, req.body.otp);
    res.status(200).json(result);
  }),
);
