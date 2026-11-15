import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json()
    
    // Handles both Supabase Database Webhooks (payload.record) and direct calls
    const record = payload.record || payload;
    const { reference_no, email, status, registrar_remarks } = record

    if (!email || !reference_no || !status) {
      throw new Error("Missing required parameters (email, reference_no, or status).");
    }

    const formattedStatus = status.replaceAll('_', ' ').toUpperCase();

    // Call Resend API to dispatch the email
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Sto. Niño Catholic School <onboarding@resend.dev>',
        to: [email],
        subject: `Enrollment Application Update - [${reference_no}]`,
        html: `
          <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #990000; margin-top: 0;">Sto. Niño Catholic School, Inc.</h2>
            <p>Dear Applicant,</p>
            <p>Your enrollment application status has been updated by the Registrar's Office.</p>
            
            <div style="background: #fdf2f2; padding: 15px; border-radius: 6px; border: 1px solid #f8d7d7; margin: 20px 0;">
              <p style="margin: 0 0 10px 0;"><strong>Reference Number:</strong> <code>${reference_no}</code></p>
              <p style="margin: 0;"><strong>New Status:</strong> <span style="color: #990000; font-weight: bold;">${formattedStatus}</span></p>
            </div>

            ${registrar_remarks ? `<p><strong>Registrar Remarks / Notes:</strong><br/><em>"${registrar_remarks}"</em></p>` : ''}
            
            <p>You can check further details by visiting your application portal.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            <p style="font-size: 0.85rem; color: #64748b;">This is an automated notification from the SNCS Management System.</p>
          </div>
        `,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.message || "Failed to send email via Resend.");
    }

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})