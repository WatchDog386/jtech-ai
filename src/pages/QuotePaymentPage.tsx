// © 2025 Jeff. All rights reserved.
// Unauthorized copying, distribution, or modification of this file is strictly prohibited.

import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { usePaystackPayment } from "react-paystack";
import { quotePaymentService } from "@/services/quotePaymentService";
import { supabase } from "@/integrations/supabase/client";
import { getEnv } from "@/utils/envConfig";
import {
  Loader2,
  CheckCircle,
  XCircle,
  CreditCard,
  Lock,
  ArrowLeft,
} from "lucide-react";
import { motion } from "framer-motion";

const QuotePaymentPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const {
    quoteId,
    quoteTitle,
    amount = 200,
    onPaymentComplete,
  } = location.state || {};

  const [email, setEmail] = useState(user?.email || "");
  const [paymentStatus, setPaymentStatus] = useState<
    "idle" | "processing" | "success" | "error"
  >("idle");
  const [transactionRef, setTransactionRef] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const PAYSTACK_PUBLIC_KEY =
    getEnv("NEXT_PAYSTACK_PUBLIC_KEY") || getEnv("VITE_PAYSTACK_PUBLIC_KEY");

  const handlePaystackSuccess = async (reference: any) => {
    setPaymentStatus("processing");
    try {
      // Verify payment
      const response = await fetch(
        `https://api.paystack.co/transaction/verify/${reference.reference}`,
        {
          headers: {
            Authorization: `Bearer ${getEnv("NEXT_PAYSTACK_SECRET_KEY") || getEnv("VITE_PAYSTACK_SECRET_KEY")}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error("Payment verification failed");
      }

      const data = await response.json();

      if (data.data.status === "success") {
        // Update payment status in database
        await quotePaymentService.updatePaymentStatus(
          quoteId,
          "completed",
          data.data.id,
          reference.reference,
        );

        setPaymentStatus("success");
        toast({
          title: "Payment Successful",
          description: "Your quote has been unlocked!",
        });

        setTimeout(() => {
          if (onPaymentComplete) {
            onPaymentComplete();
          }
          navigate("/quotes/all");
        }, 2000);
      } else {
        throw new Error("Payment not completed");
      }
    } catch (error) {
      console.error("Error processing payment:", error);
      setPaymentStatus("error");
      toast({
        variant: "destructive",
        title: "Payment Error",
        description:
          error instanceof Error ? error.message : "Failed to process payment",
      });
    }
  };

  const handlePaystackClose = () => {
    setPaymentStatus("idle");
  };

  const paystackConfig = {
    reference: transactionRef || "",
    email: email,
    amount: amount * 100, // Paystack uses cents
    publicKey: PAYSTACK_PUBLIC_KEY || "",
    currency: "KES",
  };

  const initializePayment = usePaystackPayment(paystackConfig);

  if (!quoteId || !quoteTitle) {
    return (
      <div className="mt-20 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-lg w-full mx-4 text-center space-y-4"
        >
          <XCircle className="w-16 h-16 text-red-500 mx-auto" />
          <h2 className="text-2xl ">Invalid Quote</h2>
          <p className="text-muted-foreground">
            Unable to process payment. Quote information is missing.
          </p>
          <Button
            onClick={() => navigate("/quotes/all")}
            className="w-full text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Quotes
          </Button>
        </motion.div>
      </div>
    );
  }

  const handlePayment = async () => {
    if (!email) {
      toast({
        variant: "destructive",
        title: "Missing Email",
        description: "Please enter your email to proceed",
      });
      return;
    }

    setIsProcessing(true);
    try {
      // Create or get payment record
      let payment = await quotePaymentService.getQuotePaymentStatus(quoteId);
      if (!payment) {
        payment = await quotePaymentService.createQuotePayment(
          quoteId,
          user?.id || "",
          amount,
        );
      }

      // Update to processing
      await quotePaymentService.updatePaymentStatus(quoteId, "processing");

      // Generate reference
      const reference = `quote_${quoteId}_${Date.now()}`;
      setTransactionRef(reference);

      // Initiate Paystack payment with callbacks
      initializePayment({
        onSuccess: handlePaystackSuccess,
        onClose: handlePaystackClose,
      });
    } catch (error) {
      console.error("Error initiating payment:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to initiate payment",
      });
      setIsProcessing(false);
    }
  };

  if (paymentStatus === "success") {
    return (
      <div className="mt-20 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="max-w-lg w-full mx-4 text-center space-y-4"
        >
          <div className="space-y-4 py-8">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
            <h2 className="text-2xl ">Payment Successful!</h2>
            <p className="text-muted-foreground">
              Quote <strong>{quoteTitle}</strong> has been unlocked.
            </p>
            <Button
              onClick={() => navigate("/quotes/all")}
              className="w-full text-white"
            >
              View Quotes
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (paymentStatus === "error") {
    return (
      <div className="mt-20 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="max-w-lg w-full mx-4 text-center space-y-4"
        >
          <div className="space-y-4 py-8">
            <XCircle className="w-16 h-16 text-red-500 mx-auto" />
            <h2 className="text-2xl ">Payment Failed</h2>
            <p className="text-muted-foreground">
              There was an issue processing your payment. Please try again.
            </p>
            <Button
              onClick={() => setPaymentStatus("idle")}
              className="w-full text-white"
            >
              Try Again
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="mt-20 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="max-w-lg w-full mx-4 text-center space-y-4"
      >
        <h1 className="sm:text-3xl items-center text-2xl flex items-center justify-center font-bold text-foreground tracking-tight">
          <Lock className="sm:w-7 sm:h-7 mr-2 text-primary dark:text-white" />
          Unlock Quote
        </h1>
        <p className="text-sm sm:text-lg bg-gradient-to-r from-primary via-primary to-primary/90 dark:from-white dark:via-blue-400 dark:to-purple-400 text-transparent bg-clip-text mt-2">
          One-time payment to access this quote
        </p>

        {isProcessing ? (
          <div className="space-y-4 py-8">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
            <p className="">Processing your payment...</p>
          </div>
        ) : (
          <div className="space-y-4 mt-10 text-left">
            {/* Quote Title Display */}
            <div className="p-4 rounded-lg border bg-muted">
              <h4 className=" mb-2">Quote Details</h4>
              <div className="flex items-center justify-between mb-3">
                <span>Quote Title</span>
                <span className=" truncate ml-2 text-right">
                  {quoteTitle}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Payment Amount</span>
                <span className=" text-lg">
                  KES {amount.toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                One-time • Non-refundable
              </p>
            </div>

            {/* Email Input */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm ">
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isProcessing}
              />
              <p className="text-xs text-muted-foreground">
                Receipt will be sent to this email
              </p>
            </div>

            {/* Features */}
            <div className="p-4 rounded-lg border bg-muted">
              <h4 className=" mb-3">You will unlock:</h4>
              <ul className="space-y-2 text-sm text-left">
                <li className="flex items-center gap-2">
                  <span className="text-green-600">✓</span>
                  <span>Quote details & progress tracking</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-600">✓</span>
                  <span>BOQ generation (PDF, Excel, Word)</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-600">✓</span>
                  <span>Edit quote information</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-600">✓</span>
                  <span>Export & download options</span>
                </li>
              </ul>
            </div>

            {/* Payment Button */}
            <Button
              onClick={handlePayment}
              disabled={isProcessing || !email}
              className="w-full text-white bg-gradient-to-r from-[#D85C2C] to-[#C94820] hover:from-[#C94820] hover:to-[#B83B1A]"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Processing Payment...
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4 mr-2" />
                  Pay KES {amount.toLocaleString()}
                </>
              )}
            </Button>

            <Button
              onClick={() => navigate("/quotes/all")}
              variant="outline"
              className="w-full"
              disabled={isProcessing}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Quotes
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              💳 Secure payment
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default QuotePaymentPage;
