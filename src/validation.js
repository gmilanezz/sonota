import { z } from 'zod';
const text = (max=300) => z.string().trim().max(max);
const required = (max=160) => text(max).min(1,'Campo obrigatório.');
const email = z.email('E-mail inválido.').max(254).transform(v=>v.toLowerCase());
export const date = z.union([z.literal(''),z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T12:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v;},'Data inválida.')]);
export const musicalKey = z.union([z.literal(''),z.string().regex(/^[A-G](?:#|b)?m?$/,'Tonalidade inválida. Use C, Am, F#m, Eb...')]);
const password = z.string().min(10,'Use pelo menos 10 caracteres.').max(128);
export const registerSchema = z.object({name:required(),email,password,studio:text().default(''),role:text().default('Produtor Musical')}).strict();
export const loginSchema = z.object({email,password:z.string().min(1).max(128)}).strict();
export const profileSchema = z.object({
  name:required(),email,studio:text(),role:text(),phone:text(40).default(''),
  notificationPreferences:z.object({deadlines:z.boolean(),payments:z.boolean(),prototypes:z.boolean(),documents:z.boolean()}).default({deadlines:true,payments:true,prototypes:true,documents:true}),
  version:z.number().int().positive(),currentPassword:z.string().max(128).optional()
}).strict();
export const clientSchema = z.object({
  name:required(),type:z.enum(['Pessoa','Empresa']).default('Pessoa'),company:text().default(''),
  email:z.union([email,z.literal('')]).default(''),phone:text(40).default(''),whatsapp:text(40).default(''),
  document:text(30).default(''),city:text(160).default(''),notes:text(10000).default(''),
  status:z.enum(['Ativo','Prospect','Pausado','Inativo']).default('Ativo')
}).strict();
export const arrangementSchema = z.object({title:required(),bpm:z.number().min(20).max(300).nullable().default(null),key:musicalKey.default(''),genre:text(100).default(''),instruments:z.array(required(60)).max(40).default([]),tags:z.array(required(60)).max(60).default([]),notes:text(10000).default('')}).strict();
export const projectSchema = z.object({
  name:required(),clientId:z.uuid(),arrangementId:z.union([z.uuid(),z.literal('')]).default(''),
  description:text(4000).default(''),proposal:text(20000).default(''),objective:text(4000).default(''),
  references:text(6000).default(''),musicalStyle:text(160).default(''),instruments:z.array(required(60)).max(40).default([]),
  status:z.enum(['Proposta','Em produção','Revisão','Concluído','Cancelado']).default('Proposta'),
  value:z.number().finite().min(0).max(999999999.99).refine(n=>Math.abs(n*100-Math.round(n*100))<0.00001,'Use no máximo duas casas decimais.').default(0),
  dueDate:date.default(''),paymentDueDate:date.default(''),paid:z.boolean().default(false)
}).strict();
export const updateSchema = schema => z.object(Object.fromEntries(Object.entries(schema.shape).map(([key,value])=>[key,(value instanceof z.ZodDefault ? value.removeDefault() : value).optional()]))).extend({version:z.number().int().positive()}).strict().refine(v=>Object.keys(v).length>1,'Informe uma alteração.');
export const docSchema = z.object({projectId:z.uuid(),description:text(2000).default('')}).strict();
export const financeSchema = z.object({paid:z.boolean(),paymentDueDate:date.optional(),version:z.number().int().positive(),mode:z.enum(['add','replace']).default('add'),description:text(2000).default('')}).strict();
export const projectVersionSchema = z.object({label:required(120),notes:text(4000).default(''),status:z.enum(['Protótipo','Revisão','Aprovado','Master']).default('Protótipo')}).strict();
export const searchSchema = z.object({query:required(1000),limit:z.number().int().min(1).max(50).default(10)}).strict();
export const jobSchema = z.object({arrangementId:z.uuid(),type:z.enum(['analysis','stems','midi','partitura'])}).strict();
export const messageSchema = z.object({message:required(1000)}).strict();
