import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { createLoanSchema, idParamSchema } from './loans.schemas';
import * as service from './loans.service';

export const loansRouter = Router();

loansRouter.use(requireAuth);

loansRouter.post(
  '/',
  validate(createLoanSchema),
  asyncHandler(async (req, res) => {
    const { loan, created } = await service.createLoan(req.userId as string, req.body);
    res.status(created ? 201 : 200).json({ loan, duplicate: !created });
  }),
);

loansRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ loans: await service.listLoans(req.userId as string) });
  }),
);

// Must be registered before '/:id' so "summary" is not parsed as an id.
loansRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    res.json({ summary: await service.getSummary(req.userId as string) });
  }),
);

loansRouter.get(
  '/:id',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ loan: await service.getLoan(req.userId as string, req.params.id as string) });
  }),
);

loansRouter.patch(
  '/:id/repay',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { loan, alreadyRepaid } = await service.repayLoan(
      req.userId as string,
      req.params.id as string,
    );
    res.json({ loan, alreadyRepaid });
  }),
);
